import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { UnauthenticatedError } from "#core/error/http/index";
import type { EmailPort } from "#core/email/index";
import type { RequestContext } from "#core/http/requestContext";
import type { OAuthProvider } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { AuthRepository } from "#src/modules/auth/domain/repository/AuthRepository";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import { AuthOAuthService } from "#src/modules/auth/service/AuthOAuthService";
import { AuthPasswordService } from "#src/modules/auth/service/AuthPasswordService";
import { AuthAttemptService } from "#src/modules/auth/service/AuthAttemptService";
import { AuthTrustedDeviceService } from "#src/modules/auth/service/AuthTrustedDeviceService";
import { AuthPasswordSupport } from "#src/modules/auth/service/AuthPasswordSupport";
import { AuthRegistrationService } from "#src/modules/auth/service/AuthRegistrationService";
import { AuthSessionService } from "#src/modules/auth/service/AuthSessionService";
import type { OAuthProviderPort } from "#src/modules/auth/service/oauth/OAuthProviderPort";
import { durationToMilliseconds } from "#src/modules/auth/utils/duration";
import type {
  AuthServiceConfig,
  AuthServiceDependencies,
} from "#src/modules/auth/service/AuthService.contracts";

/**
 * Wires the auth domain services that several use cases share.
 */
export class AuthService {
  public readonly registrationService: AuthRegistrationService;

  public readonly sessionService: AuthSessionService;

  public readonly passwordService: AuthPasswordService;

  public readonly oauthService: AuthOAuthService;

  public readonly deviceService: AuthTrustedDeviceService;

  constructor(
    db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: AuthRepository,
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
    const attempts = new AuthAttemptService(db, repository);

    this.deviceService = new AuthTrustedDeviceService(db, repository);

    this.sessionService = new AuthSessionService(
      deps,
      passwordSupport.verifyPassword.bind(passwordSupport),
      attempts,
      this.deviceService,
    );
    this.registrationService = new AuthRegistrationService(
      deps,
      passwordSupport.hashPassword.bind(passwordSupport),
      attempts,
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
      attempts,
      this.deviceService,
    );
    this.oauthService = new AuthOAuthService(deps, this.sessionService);
  }

  assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }
}
