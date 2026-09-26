import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { OAuthProvider } from "#src/modules/auth/domain/dto/AuthRequestDto";
import type { AuthRepository, UserRow } from "#src/modules/auth/domain/repository/AuthRepository";
import { AuthOAuthService } from "#src/modules/auth/service/AuthOAuthService";
import type {
  AuthServiceDependencies,
  AuthSession,
  OAuthOnboardingPayload,
  OAuthStatePayload,
} from "#src/modules/auth/service/AuthService.contracts";
import type { AuthSessionService } from "#src/modules/auth/service/AuthSessionService";
import type { OAuthProviderPort } from "#src/modules/auth/service/oauth/OAuthProviderPort";
import type { OAuthIdentity } from "#src/modules/auth/service/oauth/OAuthProviderPort";
import { decodeSignedJson, encodeSignedJson } from "#src/modules/auth/utils/crypto";

const OAUTH_SECRET = "oauth-state-secret-test";

function createUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "user-1",
    version: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    createdBy: "00000000-0000-4000-8000-000000000001",
    updatedBy: "00000000-0000-4000-8000-000000000001",
    email: "user@example.com",
    passwordHash: null,
    googleSubject: null,
    discordUserId: null,
    displayName: "User",
    systemRole: "USER",
    status: "ACTIVE",
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    lastLoginAt: null,
    ...overrides,
  };
}

function createAuthSession(user: UserRow): AuthSession {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      systemRole: user.systemRole,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
    },
    accessToken: "access-token",
    accessExpiresAt: new Date("2026-01-01T00:10:00.000Z"),
    refreshToken: "refresh-token",
    refreshExpiresAt: new Date("2026-01-08T00:00:00.000Z"),
  };
}

function createDeps(input: {
  provider?: OAuthProviderPort;
  repositoryOverrides?: Partial<
    Pick<
      AuthRepository,
      | "findByGoogleSubject"
      | "findByDiscordUserId"
      | "findByEmail"
      | "setOAuthIdentity"
      | "updateLastLogin"
      | "createUser"
    >
  >;
}) {
  const db = {} as AppDatabase;
  const transactionManager: TransactionManager = {
    inTransaction: async <T>(work: (tx: AppDatabase) => Promise<T>) => work(db),
  };

  const repository: Pick<
    AuthRepository,
    | "findByGoogleSubject"
    | "findByDiscordUserId"
    | "findByEmail"
    | "setOAuthIdentity"
    | "updateLastLogin"
    | "createUser"
  > = {
    findByGoogleSubject: jest.fn(async () => null),
    findByDiscordUserId: jest.fn(async () => null),
    findByEmail: jest.fn(async () => null),
    setOAuthIdentity: jest.fn(async () => null),
    updateLastLogin: jest.fn(async () => undefined),
    createUser: jest.fn(async () => createUserRow()),
    ...input.repositoryOverrides,
  };

  const issueSession = jest.fn(async (_db: AppDatabase, user: UserRow) => ({
    session: createAuthSession(user),
    refreshTokenId: "refresh-token-id",
  }));

  const sessionService: Pick<AuthSessionService, "assertUserCanAuthenticate" | "issueSession"> = {
    assertUserCanAuthenticate: jest.fn(),
    issueSession,
  };

  const oauthProviders: Partial<Record<OAuthProvider, OAuthProviderPort>> =
    input.provider
      ? {
          GOOGLE: input.provider,
        }
      : {};

  const deps: AuthServiceDependencies = {
    db,
    transactionManager,
    repository: repository as AuthRepository,
    emailPort: undefined,
    config: {
      jwtAccessSecret: "jwt-access-secret",
      jwtRefreshSecret: "jwt-refresh-secret",
      jwtAccessTtl: "15m",
      jwtRefreshTtl: "7d",
      emailVerificationSecret: "email-verification-secret",
      emailVerificationCodeTtlHours: 24,
      oauthStateSecret: OAUTH_SECRET,
      frontendOrigin: "http://app.localhost:5173",
    },
    oauthProviders,
    accessTtlMs: 15 * 60 * 1000,
    refreshTtlMs: 7 * 24 * 60 * 60 * 1000,
  };

  return {
    deps,
    repository,
    sessionService,
    issueSession,
  };
}

describe("AuthOAuthService", () => {
  it("starts OAuth without external account using provider stub", async () => {
    const provider: OAuthProviderPort = {
      createAuthorizationUrl: jest.fn(async ({ state }) =>
        new URL(`https://oauth.example.test/authorize?state=${state}`),
      ),
      exchangeAndResolveIdentity: jest.fn(),
    };

    const { deps, sessionService } = createDeps({ provider });
    const service = new AuthOAuthService(deps, sessionService as AuthSessionService);

    const result = await service.startOAuth({
      provider: "GOOGLE",
      intent: "login",
      redirectPath: "https://malicious.example.test",
    });

    const statePayload = decodeSignedJson<OAuthStatePayload>(
      result.stateCookieValue,
      OAUTH_SECRET,
    );

    expect(result.authorizationUrl.toString()).toContain("https://oauth.example.test/authorize");
    expect(result.stateCookieTtlMs).toBeGreaterThan(0);
    expect(statePayload?.provider).toBe("GOOGLE");
    expect(statePayload?.intent).toBe("login");
    expect(statePayload?.redirectPath).toBe("/");
    expect(typeof statePayload?.state).toBe("string");
  });

  it("returns registration_required on callback for unknown user without real provider", async () => {
    const provider: OAuthProviderPort = {
      createAuthorizationUrl: jest.fn(),
      exchangeAndResolveIdentity: jest.fn(async (): Promise<OAuthIdentity> => ({
        provider: "GOOGLE",
        subject: "google-sub-123",
        email: "New.User@Example.test",
        emailVerified: true,
        displayName: "New User",
      })),
    };

    const { deps, sessionService, issueSession } = createDeps({ provider });
    const service = new AuthOAuthService(deps, sessionService as AuthSessionService);

    const state = "oauth-state-1";
    const stateCookie = encodeSignedJson<OAuthStatePayload>(
      {
        state,
        provider: "GOOGLE",
        intent: "register",
        redirectPath: "/welcome",
        nonce: "nonce-123",
        expiresAt: Date.now() + 60_000,
      },
      OAUTH_SECRET,
    );

    const result = await service.completeOAuthCallback({
      provider: "GOOGLE",
      code: "test-code",
      state,
      stateCookieValue: stateCookie,
      metadata: {
        userAgent: "jest",
        ip: "127.0.0.1",
      },
    });

    expect(result.type).toBe("registration_required");
    if (result.type === "registration_required") {
      const onboarding = decodeSignedJson<OAuthOnboardingPayload>(
        result.onboardingCookieValue,
        OAUTH_SECRET,
      );

      expect(onboarding?.email).toBe("new.user@example.test");
      expect(onboarding?.provider).toBe("GOOGLE");
      expect(result.redirectPath).toBe("/welcome");
    }

    expect(issueSession).not.toHaveBeenCalled();
  });

  it("completes oauth registration locally with repository/session mocks", async () => {
    const createdUser = createUserRow({
      id: "user-oauth-1",
      email: "fresh@example.test",
      displayName: "Fresh User",
      emailVerifiedAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const linkedUser = createUserRow({
      ...createdUser,
      discordUserId: "discord-sub-123",
    });

    const createUserMock = jest.fn(async () => createdUser);
    const linkIdentityMock = jest.fn(async () => linkedUser);

    const { deps, repository, sessionService, issueSession } = createDeps({
      repositoryOverrides: {
        findByDiscordUserId: jest.fn(async () => null),
        findByEmail: jest.fn(async () => null),
        createUser: createUserMock,
        setOAuthIdentity: linkIdentityMock,
      },
    });

    const service = new AuthOAuthService(deps, sessionService as AuthSessionService);

    const onboardingCookie = encodeSignedJson<OAuthOnboardingPayload>(
      {
        provider: "DISCORD",
        subject: "discord-sub-123",
        email: "fresh@example.test",
        displayName: "Fresh User",
        redirectPath: "/onboarding",
        intent: "register",
        expiresAt: Date.now() + 60_000,
      },
      OAUTH_SECRET,
    );

    const session = await service.completeOAuthRegistration(
      {
        displayName: "  Fresh User  ",
        privacyAccepted: true,
      },
      onboardingCookie,
      {
        userAgent: "jest",
        ip: "127.0.0.1",
      },
    );

    expect(session.user.id).toBe("user-oauth-1");

    expect(createUserMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        email: "fresh@example.test",
        displayName: "Fresh User",
        passwordHash: null,
        systemRole: "USER",
        status: "ACTIVE",
      }),
    );

    expect(linkIdentityMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-oauth-1",
        provider: "DISCORD",
        subject: "discord-sub-123",
      }),
    );

    expect(repository.updateLastLogin).toHaveBeenCalled();
    expect(issueSession).toHaveBeenCalledWith(expect.anything(), createdUser, {
      userAgent: "jest",
      ip: "127.0.0.1",
    });
  });

  it("rejects invalid oauth state without contacting provider", async () => {
    const provider: OAuthProviderPort = {
      createAuthorizationUrl: jest.fn(),
      exchangeAndResolveIdentity: jest.fn(),
    };

    const { deps, sessionService } = createDeps({ provider });
    const service = new AuthOAuthService(deps, sessionService as AuthSessionService);

    const state = "oauth-state-2";
    const stateCookie = encodeSignedJson<OAuthStatePayload>(
      {
        state,
        provider: "GOOGLE",
        intent: "login",
        redirectPath: "/",
        nonce: "nonce-1",
        expiresAt: Date.now() - 1000,
      },
      OAUTH_SECRET,
    );

    await expect(
      service.completeOAuthCallback({
        provider: "GOOGLE",
        code: "test-code",
        state,
        stateCookieValue: stateCookie,
        metadata: {
          userAgent: "jest",
          ip: "127.0.0.1",
        },
      }),
    ).rejects.toMatchObject({
      code: "OAUTH_STATE_INVALID",
      statusCode: 401,
    });

    expect(provider.exchangeAndResolveIdentity).not.toHaveBeenCalled();
  });
});
