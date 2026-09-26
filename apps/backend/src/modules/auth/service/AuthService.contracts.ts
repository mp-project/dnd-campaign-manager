import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { EmailPort } from "#core/email/index";
import type {
  OAuthIntent,
  OAuthProvider,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import type {
  AuthRepository,
  EmailVerificationRequestRow,
  UserRow,
} from "#src/modules/auth/domain/repository/AuthRepository";
import type { OAuthProviderPort } from "#src/modules/auth/service/oauth/OAuthProviderPort";

export const MAX_VERIFICATION_ATTEMPTS = 5;
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const OAUTH_ONBOARDING_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export type ClientMetadata = {
  userAgent: string | undefined;
  ip: string | undefined;
};

export type OAuthStatePayload = {
  state: string;
  provider: OAuthProvider;
  intent: OAuthIntent;
  redirectPath: string;
  nonce: string | undefined;
  expiresAt: number;
};

export type OAuthOnboardingPayload = {
  provider: OAuthProvider;
  subject: string;
  email: string;
  displayName: string | undefined;
  redirectPath: string;
  intent: OAuthIntent;
  expiresAt: number;
};

export type RegisterUserResult = {
  user: UserRow;
  verificationRequest: EmailVerificationRequestRow;
  verificationCode: string;
};

export type VerifyRegistrationLinkResult = {
  user: UserRow;
  redirectPath: string;
};

export type AuthSession = {
  user: {
    id: string;
    email: string;
    displayName: string;
    systemRole: UserRow["systemRole"];
    status: UserRow["status"];
    emailVerifiedAt: Date | null;
  };
  accessToken: string;
  accessExpiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
};

export type StartOAuthResult = {
  authorizationUrl: URL;
  stateCookieValue: string;
  stateCookieTtlMs: number;
};

export type CompleteOAuthCallbackResult =
  | {
      type: "authenticated";
      session: AuthSession;
      redirectPath: string;
    }
  | {
      type: "registration_required";
      onboardingCookieValue: string;
      onboardingCookieTtlMs: number;
      redirectPath: string;
    };

export type AuthServiceConfig = {
  jwtAccessSecret: string;
  jwtRefreshSecret: string;
  jwtAccessTtl: string;
  jwtRefreshTtl: string;
  emailVerificationSecret: string;
  emailVerificationCodeTtlHours: number;
  apiBaseUrl: string;
  oauthStateSecret: string | undefined;
  frontendOrigin: string;
};

export type AuthServiceDependencies = {
  db: AppDatabase;
  transactionManager: TransactionManager;
  repository: AuthRepository;
  emailPort: EmailPort | undefined;
  config: AuthServiceConfig;
  oauthProviders: Partial<Record<OAuthProvider, OAuthProviderPort>>;
  accessTtlMs: number;
  refreshTtlMs: number;
};
