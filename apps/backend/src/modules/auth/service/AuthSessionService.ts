import { randomBytes, randomUUID } from "node:crypto";

import jsonwebtoken, { type SignOptions } from "jsonwebtoken";

import type { AppDatabase } from "#core/db/pool";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import type { LoginDto } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { UserRow } from "#src/modules/auth/domain/repository/AuthRepository";
import {
  type AuthAttemptService,
  loginAttemptKeys,
  refreshAttemptKeys,
  trustedDeviceAttemptKey,
} from "#src/modules/auth/service/AuthAttemptService";
import type { AuthTrustedDeviceService } from "#src/modules/auth/service/AuthTrustedDeviceService";
import {
  type AuthServiceDependencies,
  type AuthSession,
  type ClientMetadata,
  REFRESH_ROTATION_GRACE_MS,
} from "#src/modules/auth/service/AuthService.contracts";
import { sha256 } from "#src/modules/auth/utils/crypto";

export class AuthSessionService {
  constructor(
    private readonly deps: AuthServiceDependencies,
    private readonly verifyPassword: (passwordHash: string | null, password: string) => Promise<boolean>,
    private readonly attempts: AuthAttemptService,
    private readonly devices: AuthTrustedDeviceService,
  ) {}

  async login(
    input: LoginDto,
    metadata: ClientMetadata,
    deviceToken: string | null = null,
  ): Promise<AuthSession> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const device = await this.devices.findForEmail(deviceToken, normalizedEmail);
    const keys = loginAttemptKeys(normalizedEmail, metadata.ip);
    const deviceKey = device ? trustedDeviceAttemptKey(device.id) : null;
    const session = await this.attempts.trackFailures(
      deviceKey ? [deviceKey] : keys.all,
      (error) => error instanceof AuthError && error.code === "INVALID_CREDENTIALS",
      () => this.loginInTransaction(normalizedEmail, input.password, metadata),
    );

    await this.attempts.clear(deviceKey ?? keys.emailIp);

    if (device) {
      await this.devices.markUsed(device.id);
    }

    return session;
  }

  private loginInTransaction(
    normalizedEmail: string,
    password: string,
    metadata: ClientMetadata,
  ): Promise<AuthSession> {
    return this.deps.transactionManager.inTransaction(async (tx) => {
      const user = await this.deps.repository.findByEmail(tx, normalizedEmail);
      const passwordValid = await this.verifyPassword(
        user?.passwordHash ?? null,
        password,
      );

      if (!user || !passwordValid) {
        throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
      }

      this.assertUserCanAuthenticate(user);

      if (!user.emailVerifiedAt) {
        throw new AuthError("EMAIL_NOT_VERIFIED", "Email verification required");
      }

      await this.deps.repository.updateLastLogin(tx, {
        userId: user.id,
        at: new Date(),
        actorId: user.id,
      });

      const issuedSession = await this.issueSession(tx, user, metadata);

      return issuedSession.session;
    });
  }

  async refresh(refreshToken: string, metadata: ClientMetadata): Promise<AuthSession> {
    const tokenHash = sha256(refreshToken);

    return this.attempts.trackFailures(
      refreshAttemptKeys(tokenHash, metadata.ip),
      (error) => error instanceof AuthError && error.code === "SESSION_INVALID",
      () => this.refreshInTransaction(tokenHash, metadata),
    );
  }

  private async refreshInTransaction(
    tokenHash: string,
    metadata: ClientMetadata,
  ): Promise<AuthSession> {
    // Failures are returned instead of thrown: throwing would roll back the revocations.
    const outcome = await this.deps.transactionManager.inTransaction(async (tx) => {
      // The row lock makes parallel requests with one token run in turn, so only one can rotate it.
      const currentToken = await this.deps.repository.findRefreshTokenByHashForUpdate(tx, tokenHash);

      if (!currentToken) {
        throw new AuthError("SESSION_INVALID", "Session is invalid");
      }

      if (
        !currentToken.revokedAt &&
        currentToken.rotatedAt &&
        Date.now() - currentToken.rotatedAt.getTime() < REFRESH_ROTATION_GRACE_MS
      ) {
        // Usually a second tab or a retry: it issues nothing and revokes nothing.
        throw new AuthError("SESSION_ALREADY_ROTATED", "Session was just refreshed");
      }

      if (currentToken.revokedAt || currentToken.rotatedAt) {
        // Replay detection: if an old/rotated token is reused, invalidate the whole session family.
        await this.deps.repository.updateRefreshTokenFamilyRevoked(tx, {
          familyId: currentToken.familyId,
          actorId: currentToken.userId,
        });

        return { invalid: true as const };
      }

      if (currentToken.expiresAt.getTime() <= Date.now()) {
        await this.deps.repository.updateRefreshTokenRevoked(tx, {
          tokenId: currentToken.id,
          actorId: currentToken.userId,
        });

        return { invalid: true as const };
      }

      const user = await this.deps.repository.findById(tx, currentToken.userId);

      if (!user) {
        throw new AuthError("SESSION_INVALID", "Session is invalid");
      }

      this.assertUserCanAuthenticate(user);

      const nextSession = await this.issueSession(tx, user, metadata, currentToken.familyId);

      await this.deps.repository.updateRefreshTokenRotated(tx, {
        tokenId: currentToken.id,
        replacedById: nextSession.refreshTokenId,
        actorId: user.id,
      });

      return { session: nextSession.session };
    });

    if ("invalid" in outcome) {
      throw new AuthError("SESSION_INVALID", "Session is invalid");
    }

    return outcome.session;
  }

  async logoutCurrent(refreshToken: string | null): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const tokenHash = sha256(refreshToken);

    await this.deps.transactionManager.inTransaction(async (tx) => {
      const currentToken = await this.deps.repository.findRefreshTokenByHash(tx, tokenHash);

      if (!currentToken) {
        return;
      }

      await this.deps.repository.updateRefreshTokenRevoked(tx, {
        tokenId: currentToken.id,
        actorId: currentToken.userId,
      });
    });
  }

  async logoutAll(actorId: string): Promise<void> {
    await this.deps.transactionManager.inTransaction(async (tx) => {
      await this.deps.repository.updateSessionVersion(tx, { userId: actorId, actorId });
      await this.deps.repository.deleteTrustedDevicesForUser(tx, actorId);
      await this.deps.repository.updateRefreshTokensRevokedForUser(tx, {
        userId: actorId,
        actorId,
      });
    });
  }

  async revokeRefreshTokensForUser(userId: string): Promise<void> {
    await this.deps.transactionManager.inTransaction(async (tx) => {
      await this.deps.repository.updateRefreshTokensRevokedForUser(tx, {
        userId,
        actorId: userId,
      });
    });
  }

  /**
   * Decides whether a signed access token still counts: the account must exist and be active,
   * and the token must carry the current session version. The role comes from the database.
   */
  async resolveActor(input: {
    actorId: string;
    sessionVersion: number | null;
  }): Promise<{ systemRole: UserRow["systemRole"] } | null> {
    if (input.sessionVersion === null) {
      return null;
    }

    const state = await this.deps.repository.findSessionState(this.deps.db, input.actorId);

    if (!state || state.status !== "ACTIVE" || state.sessionVersion !== input.sessionVersion) {
      return null;
    }

    return { systemRole: state.systemRole };
  }

  assertUserCanAuthenticate(user: UserRow): void {
    if (user.status !== "ACTIVE") {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
    }
  }

  async issueSession(
    db: AppDatabase,
    user: UserRow,
    metadata: ClientMetadata,
    // familyId groups rotated refresh tokens that belong to the same login session.
    familyId: string = randomUUID(),
  ): Promise<{ session: AuthSession; refreshTokenId: string }> {
    const issuedAt = Date.now();
    const accessExpiresAt = new Date(issuedAt + this.deps.accessTtlMs);
    const refreshExpiresAt = new Date(issuedAt + this.deps.refreshTtlMs);
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTokenHash = sha256(refreshToken);
    const userAgent = metadata.userAgent?.slice(0, 500);
    const ipHash = metadata.ip ? sha256(metadata.ip) : undefined;

    const refreshTokenInput: {
      userId: string;
      familyId: string;
      tokenHash: string;
      expiresAt: Date;
      actorId: string;
      userAgent?: string;
      ipHash?: string;
    } = {
      userId: user.id,
      familyId,
      tokenHash: refreshTokenHash,
      expiresAt: refreshExpiresAt,
      actorId: user.id,
    };

    if (userAgent !== undefined) {
      refreshTokenInput.userAgent = userAgent;
    }

    if (ipHash !== undefined) {
      refreshTokenInput.ipHash = ipHash;
    }

    const storedRefreshToken = await this.deps.repository.createRefreshToken(
      db,
      refreshTokenInput,
    );

    const accessToken = this.signAccessToken(user);

    return {
      session: {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          username: user.username,
          userTag: user.userTag,
          systemRole: user.systemRole,
          status: user.status,
          emailVerifiedAt: user.emailVerifiedAt,
        },
        accessToken,
        accessExpiresAt,
        refreshToken,
        refreshExpiresAt,
      },
      refreshTokenId: storedRefreshToken.id,
    };
  }

  private signAccessToken(user: UserRow): string {
    const expiresIn = this.deps.config.jwtAccessTtl as NonNullable<SignOptions["expiresIn"]>;

    return jsonwebtoken.sign(
      {
        systemRole: user.systemRole,
        sv: user.sessionVersion,
      },
      this.deps.config.jwtAccessSecret,
      {
        algorithm: "HS256",
        subject: user.id,
        expiresIn,
      },
    );
  }
}
