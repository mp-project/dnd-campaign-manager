import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { AUTH_HTTP_PREFIX } from "#src/modules/auth/config/AuthHttpConfig";
import { AuthRepository } from "#src/modules/auth/domain/repository/AuthRepository";
import { AuthController } from "#src/modules/auth/http/controller/AuthController";
import { registerAuthRoutes } from "#src/modules/auth/http/routes/v1/AuthRoutes";
import { authPermissionDefinitions } from "#src/modules/auth/permissions/AuthPermissions";
import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";
import { AuthService } from "#src/modules/auth/service/AuthService";
import { DiscordOAuthProvider } from "#src/modules/auth/service/oauth/DiscordOAuthProvider";
import { GoogleOAuthProvider } from "#src/modules/auth/service/oauth/GoogleOAuthProvider";
import type { OAuthProviderPort } from "#src/modules/auth/service/oauth/OAuthProviderPort";

export const AUTH_SESSION_DEPENDENCIES = "auth.session.dependencies";
export const AUTH_MODULE_DEPENDENCIES = "auth.module.dependencies";

export type AuthSessionDependencies = {
  revokeRefreshTokensForUser(userId: string): Promise<void>;
};

export type AuthModuleDependencies = {
  repository: AuthRepository;
  service: AuthService;
};

async function registerAuthModule(
  app: FastifyInstance,
  container: AppContainer,
): Promise<void> {
  container.ports.permissionService?.registerDefinitions(
    "auth",
    authPermissionDefinitions,
  );
  container.ports.permissionService?.registerSystemRolePermissions(ROLE_PERMISSIONS);

  const oauthProviders = createOAuthProviders(container);
  const repository = new AuthRepository();
  const service = new AuthService(
    container.db,
    container.transactionManager,
    repository,
    container.ports.emailPort,
    {
      jwtAccessSecret: container.config.JWT_ACCESS_SECRET,
      jwtRefreshSecret: container.config.JWT_REFRESH_SECRET,
      jwtAccessTtl: container.config.JWT_ACCESS_TTL,
      jwtRefreshTtl: container.config.JWT_REFRESH_TTL,
      emailVerificationSecret:
        container.config.EMAIL_VERIFICATION_SECRET ?? container.config.JWT_ACCESS_SECRET,
      emailVerificationCodeTtlHours: container.config.EMAIL_VERIFICATION_CODE_TTL_HOURS,
      apiBaseUrl: container.config.VITE_API_BASE_URL,
      oauthStateSecret: container.config.OAUTH_STATE_SECRET,
      frontendOrigin: container.config.FRONTEND_ORIGIN,
    },
    oauthProviders,
  );

  const sessionDependencies: AuthSessionDependencies = {
    revokeRefreshTokensForUser: async (userId) => {
      await service.revokeRefreshTokensForUser(userId);
    },
  };

  container.dependencies.set(AUTH_SESSION_DEPENDENCIES, sessionDependencies);
  container.dependencies.set<AuthModuleDependencies>(AUTH_MODULE_DEPENDENCIES, {
    repository,
    service,
  });

  const secureCookies =
    container.config.NODE_ENV === "production" || container.config.NODE_ENV === "stage";
  const authController = new AuthController(service, {
    secureCookies,
    frontendOrigin: container.config.FRONTEND_ORIGIN,
  });

  app.register(
    async (authApp) => {
      registerAuthRoutes(authApp, {
        authController,
      });
    },
    { prefix: AUTH_HTTP_PREFIX },
  );
}

function createOAuthProviders(
  container: AppContainer,
): Partial<Record<"GOOGLE" | "DISCORD", OAuthProviderPort>> {
  const providers: Partial<Record<"GOOGLE" | "DISCORD", OAuthProviderPort>> = {};

  if (
    container.config.OAUTH_GOOGLE_CLIENT_ID &&
    container.config.OAUTH_GOOGLE_CLIENT_SECRET &&
    container.config.OAUTH_GOOGLE_CALLBACK_URL
  ) {
    providers.GOOGLE = new GoogleOAuthProvider({
      clientId: container.config.OAUTH_GOOGLE_CLIENT_ID,
      clientSecret: container.config.OAUTH_GOOGLE_CLIENT_SECRET,
      callbackUrl: container.config.OAUTH_GOOGLE_CALLBACK_URL,
    });
  }

  if (
    container.config.OAUTH_DISCORD_CLIENT_ID &&
    container.config.OAUTH_DISCORD_CLIENT_SECRET &&
    container.config.OAUTH_DISCORD_CALLBACK_URL
  ) {
    providers.DISCORD = new DiscordOAuthProvider({
      clientId: container.config.OAUTH_DISCORD_CLIENT_ID,
      clientSecret: container.config.OAUTH_DISCORD_CLIENT_SECRET,
      callbackUrl: container.config.OAUTH_DISCORD_CALLBACK_URL,
    });
  }

  return providers;
}

export const authModule: AppModule = {
  name: "auth",
  dependencies: ["system"],
  register: registerAuthModule,
};
