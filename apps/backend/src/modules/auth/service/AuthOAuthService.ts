import { randomBytes } from "node:crypto";

import type { AppDatabase } from "#core/db/pool";
import { InternalError } from "#core/error/http/index";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import type {
  OAuthIntent,
  OAuthProvider,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import type {
  AuthServiceDependencies,
  ClientMetadata,
  CompleteOAuthCallbackResult,
  OAuthOnboardingPayload,
  OAuthStatePayload,
  StartOAuthResult,
} from "#src/modules/auth/service/AuthService.contracts";
import {
  OAUTH_ONBOARDING_TTL_MS,
  OAUTH_STATE_TTL_MS,
} from "#src/modules/auth/service/AuthService.contracts";
import {
  normalizeEmail,
  normalizeRedirectPath,
} from "#src/modules/auth/service/AuthService.utils";
import { decodeSignedJson, encodeSignedJson } from "#src/modules/auth/utils/crypto";
import type { AuthSessionService } from "#src/modules/auth/service/AuthSessionService";

export class AuthOAuthService {
  constructor(
    private readonly deps: AuthServiceDependencies,
    private readonly sessionService: AuthSessionService,
  ) {}

  async startOAuth(input: {
    provider: OAuthProvider;
    intent: OAuthIntent;
    redirectPath: string;
  }): Promise<StartOAuthResult> {
    const provider = this.deps.oauthProviders[input.provider];

    if (!provider || !this.deps.config.oauthStateSecret) {
      throw new AuthError(
        "OAUTH_PROVIDER_UNAVAILABLE",
        `OAuth provider ${input.provider} is not configured`,
      );
    }

    const state = randomBytes(18).toString("base64url");
    const nonce =
      input.provider === "GOOGLE" ? randomBytes(18).toString("base64url") : undefined;

    const payload: OAuthStatePayload = {
      state,
      provider: input.provider,
      intent: input.intent,
      redirectPath: normalizeRedirectPath(input.redirectPath),
      nonce,
      expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    };

    const stateCookieValue = encodeSignedJson(payload, this.deps.config.oauthStateSecret);
    const authorizationUrl = await provider.createAuthorizationUrl({
      state,
      nonce,
      intent: input.intent,
    });

    return {
      authorizationUrl,
      stateCookieValue,
      stateCookieTtlMs: OAUTH_STATE_TTL_MS,
    };
  }

  async completeOAuthCallback(input: {
    provider: OAuthProvider;
    code: string;
    state: string;
    stateCookieValue: string | null;
    metadata: ClientMetadata;
  }): Promise<CompleteOAuthCallbackResult> {
    if (!this.deps.config.oauthStateSecret || !input.stateCookieValue) {
      throw new AuthError("OAUTH_STATE_INVALID", "OAuth state is invalid");
    }

    const statePayload = decodeSignedJson<OAuthStatePayload>(
      input.stateCookieValue,
      this.deps.config.oauthStateSecret,
    );

    if (
      !statePayload ||
      statePayload.expiresAt <= Date.now() ||
      statePayload.provider !== input.provider ||
      statePayload.state !== input.state
    ) {
      throw new AuthError("OAUTH_STATE_INVALID", "OAuth state is invalid");
    }

    const provider = this.deps.oauthProviders[input.provider];

    if (!provider) {
      throw new AuthError(
        "OAUTH_PROVIDER_UNAVAILABLE",
        `OAuth provider ${input.provider} is not configured`,
      );
    }

    const identity = await provider.exchangeAndResolveIdentity({
      code: input.code,
      nonce: statePayload.nonce,
    });

    if (!identity.emailVerified || !identity.email.trim()) {
      throw new AuthError(
        "OAUTH_VERIFIED_EMAIL_REQUIRED",
        "Verified email is required for OAuth sign-in",
      );
    }

    const normalizedEmail = normalizeEmail(identity.email);

    return this.deps.transactionManager.inTransaction(async (tx) => {
      const byProvider = await this.findUserByProvider(tx, identity.provider, identity.subject);

      if (byProvider) {
        this.sessionService.assertUserCanAuthenticate(byProvider);
        await this.deps.repository.updateLastLogin(tx, {
          userId: byProvider.id,
          at: new Date(),
          actorId: byProvider.id,
        });

        const session = await this.sessionService.issueSession(tx, byProvider, input.metadata);

        return {
          type: "authenticated",
          session: session.session,
          redirectPath: statePayload.redirectPath,
        };
      }

      const byEmail = await this.deps.repository.findByEmail(tx, normalizedEmail);

      if (byEmail) {
        this.sessionService.assertUserCanAuthenticate(byEmail);
        this.assertNoIdentityConflict(byEmail, identity.provider, identity.subject);

        const oauthIdentityUpdate: {
          userId: string;
          provider: OAuthProvider;
          subject: string;
          actorId: string;
          markEmailVerifiedAt?: Date;
        } = {
          userId: byEmail.id,
          provider: identity.provider,
          subject: identity.subject,
          actorId: byEmail.id,
        };

        if (!byEmail.emailVerifiedAt) {
          oauthIdentityUpdate.markEmailVerifiedAt = new Date();
        }

        const linkedUser = await this.deps.repository.setOAuthIdentity(tx, oauthIdentityUpdate);

        const resolvedUser = linkedUser ?? byEmail;

        await this.deps.repository.updateLastLogin(tx, {
          userId: resolvedUser.id,
          at: new Date(),
          actorId: resolvedUser.id,
        });

        const session = await this.sessionService.issueSession(tx, resolvedUser, input.metadata);

        return {
          type: "authenticated",
          session: session.session,
          redirectPath: statePayload.redirectPath,
        };
      }

      if (!this.deps.config.oauthStateSecret) {
        throw new AuthError("OAUTH_PROVIDER_UNAVAILABLE", "OAuth state secret missing");
      }

      const onboardingPayload: OAuthOnboardingPayload = {
        provider: identity.provider,
        subject: identity.subject,
        email: normalizedEmail,
        displayName: identity.displayName,
        redirectPath: statePayload.redirectPath,
        intent: statePayload.intent,
        expiresAt: Date.now() + OAUTH_ONBOARDING_TTL_MS,
      };

      const onboardingCookieValue = encodeSignedJson(
        onboardingPayload,
        this.deps.config.oauthStateSecret,
      );

      return {
        type: "registration_required",
        onboardingCookieValue,
        onboardingCookieTtlMs: OAUTH_ONBOARDING_TTL_MS,
        redirectPath: statePayload.redirectPath,
      };
    });
  }

  async completeOAuthRegistration(
    input: {
      displayName: string;
      privacyAccepted: true;
    },
    onboardingCookieValue: string | null,
    metadata: ClientMetadata,
  ) {
    if (!this.deps.config.oauthStateSecret || !onboardingCookieValue) {
      throw new AuthError("OAUTH_REGISTRATION_REQUIRED", "OAuth onboarding context missing");
    }

    const onboarding = decodeSignedJson<OAuthOnboardingPayload>(
      onboardingCookieValue,
      this.deps.config.oauthStateSecret,
    );

    if (!onboarding || onboarding.expiresAt <= Date.now()) {
      throw new AuthError("OAUTH_REGISTRATION_REQUIRED", "OAuth onboarding context expired");
    }

    return this.deps.transactionManager.inTransaction(async (tx) => {
      const byProvider = await this.findUserByProvider(
        tx,
        onboarding.provider,
        onboarding.subject,
      );

      if (byProvider) {
        this.sessionService.assertUserCanAuthenticate(byProvider);

        const session = await this.sessionService.issueSession(tx, byProvider, metadata);
        return session.session;
      }

      const existingUser = await this.deps.repository.findByEmail(tx, onboarding.email);

      if (existingUser) {
        throw new AuthError(
          "OAUTH_IDENTITY_CONFLICT",
          "A user with this verified email already exists",
        );
      }

      const user = await this.deps.repository.createUser(tx, {
        email: onboarding.email,
        displayName: input.displayName.trim(),
        passwordHash: null,
        systemRole: SYSTEM_ROLE.USER,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      });

      if (onboarding.provider === "GOOGLE") {
        const linkedGoogleUser = await this.deps.repository.setOAuthIdentity(tx, {
          userId: user.id,
          provider: "GOOGLE",
          subject: onboarding.subject,
          actorId: user.id,
        });

        if (!linkedGoogleUser) {
          throw new InternalError("Failed to link Google identity");
        }
      }

      if (onboarding.provider === "DISCORD") {
        const linkedDiscordUser = await this.deps.repository.setOAuthIdentity(tx, {
          userId: user.id,
          provider: "DISCORD",
          subject: onboarding.subject,
          actorId: user.id,
        });

        if (!linkedDiscordUser) {
          throw new InternalError("Failed to link Discord identity");
        }
      }

      await this.deps.repository.updateLastLogin(tx, {
        userId: user.id,
        at: new Date(),
        actorId: user.id,
      });

      const session = await this.sessionService.issueSession(tx, user, metadata);

      return session.session;
    });
  }

  private assertNoIdentityConflict(
    user: {
      googleSubject: string | null;
      discordUserId: string | null;
    },
    provider: OAuthProvider,
    subject: string,
  ): void {
    if (provider === "GOOGLE") {
      if (user.googleSubject && user.googleSubject !== subject) {
        throw new AuthError(
          "OAUTH_IDENTITY_CONFLICT",
          "Google identity is already linked to another account",
        );
      }

      return;
    }

    if (user.discordUserId && user.discordUserId !== subject) {
      throw new AuthError(
        "OAUTH_IDENTITY_CONFLICT",
        "Discord identity is already linked to another account",
      );
    }
  }

  private async findUserByProvider(
    db: AppDatabase,
    provider: OAuthProvider,
    subject: string,
  ) {
    if (provider === "GOOGLE") {
      return this.deps.repository.findByGoogleSubject(db, subject);
    }

    return this.deps.repository.findByDiscordUserId(db, subject);
  }
}
