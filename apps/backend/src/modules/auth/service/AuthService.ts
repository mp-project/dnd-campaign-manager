import type { AppDatabase, TransactionManager } from "#core/db/pool";
import {
  UnauthenticatedError,
} from "#core/error/http/index";
import type { EmailPort } from "#core/email/index";
import type { RequestContext } from "#core/http/requestContext";
import type {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  OAuthIntent,
  OAuthProvider,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailVerificationDto,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import type {
  AuthRepository,
  UserRow,
} from "#src/modules/auth/domain/repository/AuthRepository";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import { AuthOAuthService } from "#src/modules/auth/service/AuthOAuthService";
import { AuthPasswordService } from "#src/modules/auth/service/AuthPasswordService";
import { AuthPasswordSupport } from "#src/modules/auth/service/AuthPasswordSupport";
import { AuthRegistrationService } from "#src/modules/auth/service/AuthRegistrationService";
import { AuthSessionService } from "#src/modules/auth/service/AuthSessionService";
import type { OAuthProviderPort } from "#src/modules/auth/service/oauth/OAuthProviderPort";
import { durationToMilliseconds } from "#src/modules/auth/utils/duration";
import type {
  AuthServiceConfig,
  AuthServiceDependencies,
  AuthSession,
  ClientMetadata,
  CompleteOAuthCallbackResult,
  RegisterUserResult,
  StartOAuthResult,
} from "#src/modules/auth/service/AuthService.contracts";

export type {
  AuthServiceConfig,
  AuthSession,
  CompleteOAuthCallbackResult,
  RegisterUserResult,
  StartOAuthResult,
} from "#src/modules/auth/service/AuthService.contracts";

export class AuthService {
  private readonly registrationService: AuthRegistrationService;

  private readonly sessionService: AuthSessionService;

  private readonly passwordService: AuthPasswordService;

  private readonly oauthService: AuthOAuthService;

  constructor(
    db: AppDatabase,
    transactionManager: TransactionManager,
    repository: AuthRepository,
    emailPort: EmailPort | undefined,
    config: AuthServiceConfig,
    oauthProviders: Partial<Record<OAuthProvider, OAuthProviderPort>>,
  ) {
    const deps: AuthServiceDependencies = {
      db,
      transactionManager,
      repository,
      emailPort,
      config,
      oauthProviders,
      accessTtlMs: durationToMilliseconds(config.jwtAccessTtl),
      refreshTtlMs: durationToMilliseconds(config.jwtRefreshTtl),
    };
    const passwordSupport = new AuthPasswordSupport();

    this.sessionService = new AuthSessionService(
      deps,
      passwordSupport.verifyPassword.bind(passwordSupport),
    );
    this.registrationService = new AuthRegistrationService(
      deps,
      passwordSupport.hashPassword.bind(passwordSupport),
    );
    this.passwordService = new AuthPasswordService(
      deps,
      this.assertAuthenticated.bind(this),
      (status) => {
        if (status !== "ACTIVE") {
          throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
        }
      },
      passwordSupport.hashPassword.bind(passwordSupport),
      passwordSupport.verifyPassword.bind(passwordSupport),
      passwordSupport.consumeComparableDelay.bind(passwordSupport),
    );
    this.oauthService = new AuthOAuthService(deps, this.sessionService);
  }

  requestRegistrationVerification(email: string) {
    return this.registrationService.requestRegistrationVerification(email);
  }

  getRegistrationVerificationStatus(verificationId: string) {
    return this.registrationService.getRegistrationVerificationStatus(verificationId);
  }

  register(input: RegisterDto): Promise<RegisterUserResult> {
    return this.registrationService.register(input);
  }

  verifyRegistrationEmail(input: VerifyEmailVerificationDto): Promise<UserRow> {
    return this.registrationService.verifyRegistrationEmail(input);
  }

  login(input: LoginDto, metadata: ClientMetadata): Promise<AuthSession> {
    return this.sessionService.login(input, metadata);
  }

  refresh(refreshToken: string, metadata: ClientMetadata): Promise<AuthSession> {
    return this.sessionService.refresh(refreshToken, metadata);
  }

  logoutCurrent(refreshToken: string | null): Promise<void> {
    return this.sessionService.logoutCurrent(refreshToken);
  }

  logoutAll(context: RequestContext): Promise<void> {
    const actorId = this.assertAuthenticated(context);

    return this.sessionService.logoutAll(actorId);
  }

  revokeRefreshTokensForUser(userId: string): Promise<void> {
    return this.sessionService.revokeRefreshTokensForUser(userId);
  }

  changePassword(context: RequestContext, input: ChangePasswordDto): Promise<void> {
    return this.passwordService.changePassword(context, input);
  }

  requestPasswordReset(input: ForgotPasswordDto): Promise<void> {
    return this.passwordService.requestPasswordReset(input);
  }

  confirmPasswordReset(input: ResetPasswordDto): Promise<void> {
    return this.passwordService.confirmPasswordReset(input);
  }

  startOAuth(input: {
    provider: OAuthProvider;
    intent: OAuthIntent;
    redirectPath: string;
  }): Promise<StartOAuthResult> {
    return this.oauthService.startOAuth(input);
  }

  completeOAuthCallback(input: {
    provider: OAuthProvider;
    code: string;
    state: string;
    stateCookieValue: string | null;
    metadata: ClientMetadata;
  }): Promise<CompleteOAuthCallbackResult> {
    return this.oauthService.completeOAuthCallback(input);
  }

  completeOAuthRegistration(
    input: {
      displayName: string;
      privacyAccepted: true;
    },
    onboardingCookieValue: string | null,
    metadata: ClientMetadata,
  ): Promise<AuthSession> {
    return this.oauthService.completeOAuthRegistration(
      input,
      onboardingCookieValue,
      metadata,
    );
  }

  private assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }
}
