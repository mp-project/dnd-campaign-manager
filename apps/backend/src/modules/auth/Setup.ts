import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { AuthRepository } from "#src/modules/auth/domain/repository/AuthRepository";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RequestRegistrationVerificationController } from "#src/modules/auth/http/controller/RequestRegistrationVerificationController";
import { RequestRegistrationVerificationUseCase } from "#src/modules/auth/useCase/RequestRegistrationVerificationUseCase";
import { RegisterController } from "#src/modules/auth/http/controller/RegisterController";
import { RegisterUseCase } from "#src/modules/auth/useCase/RegisterUseCase";
import { VerifyRegistrationEmailByLinkController } from "#src/modules/auth/http/controller/VerifyRegistrationEmailByLinkController";
import { VerifyRegistrationEmailByLinkUseCase } from "#src/modules/auth/useCase/VerifyRegistrationEmailByLinkUseCase";
import { VerifyRegistrationEmailController } from "#src/modules/auth/http/controller/VerifyRegistrationEmailController";
import { VerifyRegistrationEmailUseCase } from "#src/modules/auth/useCase/VerifyRegistrationEmailUseCase";
import { LoginController } from "#src/modules/auth/http/controller/LoginController";
import { LoginUseCase } from "#src/modules/auth/useCase/LoginUseCase";
import { RefreshController } from "#src/modules/auth/http/controller/RefreshController";
import { RefreshUseCase } from "#src/modules/auth/useCase/RefreshUseCase";
import { LogoutAllController } from "#src/modules/auth/http/controller/LogoutAllController";
import { LogoutAllUseCase } from "#src/modules/auth/useCase/LogoutAllUseCase";
import { LogoutController } from "#src/modules/auth/http/controller/LogoutController";
import { LogoutUseCase } from "#src/modules/auth/useCase/LogoutUseCase";
import { ForgotPasswordController } from "#src/modules/auth/http/controller/ForgotPasswordController";
import { ForgotPasswordUseCase } from "#src/modules/auth/useCase/ForgotPasswordUseCase";
import { ResetPasswordController } from "#src/modules/auth/http/controller/ResetPasswordController";
import { ResetPasswordUseCase } from "#src/modules/auth/useCase/ResetPasswordUseCase";
import { ChangePasswordController } from "#src/modules/auth/http/controller/ChangePasswordController";
import { ChangePasswordUseCase } from "#src/modules/auth/useCase/ChangePasswordUseCase";
import { RequestEmailChangeController } from "#src/modules/auth/http/controller/RequestEmailChangeController";
import { RequestEmailChangeUseCase } from "#src/modules/auth/useCase/RequestEmailChangeUseCase";
import { ConfirmEmailChangeController } from "#src/modules/auth/http/controller/ConfirmEmailChangeController";
import { ConfirmEmailChangeUseCase } from "#src/modules/auth/useCase/ConfirmEmailChangeUseCase";
import { ConfirmEmailChangeByLinkController } from "#src/modules/auth/http/controller/ConfirmEmailChangeByLinkController";
import { ConfirmEmailChangeByLinkUseCase } from "#src/modules/auth/useCase/ConfirmEmailChangeByLinkUseCase";
import { TrustCurrentDeviceController } from "#src/modules/auth/http/controller/TrustCurrentDeviceController";
import { TrustCurrentDeviceUseCase } from "#src/modules/auth/useCase/TrustCurrentDeviceUseCase";
import { RemoveCurrentDeviceController } from "#src/modules/auth/http/controller/RemoveCurrentDeviceController";
import { RemoveCurrentDeviceUseCase } from "#src/modules/auth/useCase/RemoveCurrentDeviceUseCase";
import { StartOAuthController } from "#src/modules/auth/http/controller/StartOAuthController";
import { StartOAuthUseCase } from "#src/modules/auth/useCase/StartOAuthUseCase";
import { OAuthCallbackController } from "#src/modules/auth/http/controller/OAuthCallbackController";
import { OAuthCallbackUseCase } from "#src/modules/auth/useCase/OAuthCallbackUseCase";
import { CompleteOAuthRegistrationController } from "#src/modules/auth/http/controller/CompleteOAuthRegistrationController";
import { CompleteOAuthRegistrationUseCase } from "#src/modules/auth/useCase/CompleteOAuthRegistrationUseCase";
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

  // Tests may provide their own port; production always uses the account state.
  container.ports.sessionStatePort ??= {
    resolveActor: (input) => service.sessionService.resolveActor(input),
  };

  const sessionDependencies: AuthSessionDependencies = {
    revokeRefreshTokensForUser: async (userId) => {
      await service.sessionService.revokeRefreshTokensForUser(userId);
    },
  };

  container.dependencies.set(AUTH_SESSION_DEPENDENCIES, sessionDependencies);
  container.dependencies.set<AuthModuleDependencies>(AUTH_MODULE_DEPENDENCIES, {
    repository,
    service,
  });

  const secureCookies =
    container.config.NODE_ENV === "production" || container.config.NODE_ENV === "stage";
  const http = new AuthHttpSupport({
    secureCookies,
    frontendOrigin: container.config.FRONTEND_ORIGIN,
  });

  app.register(async (authApp) => {
    registerAuthRoutes(authApp, {
      requestRegistrationVerificationController: new RequestRegistrationVerificationController(new RequestRegistrationVerificationUseCase(service), http),
      registerController: new RegisterController(new RegisterUseCase(service), http),
      verifyRegistrationEmailByLinkController: new VerifyRegistrationEmailByLinkController(new VerifyRegistrationEmailByLinkUseCase(service), http),
      verifyRegistrationEmailController: new VerifyRegistrationEmailController(new VerifyRegistrationEmailUseCase(service), http),
      loginController: new LoginController(new LoginUseCase(service), http),
      refreshController: new RefreshController(new RefreshUseCase(service), http),
      logoutAllController: new LogoutAllController(new LogoutAllUseCase(service), http),
      logoutController: new LogoutController(new LogoutUseCase(service), http),
      forgotPasswordController: new ForgotPasswordController(new ForgotPasswordUseCase(service), http),
      resetPasswordController: new ResetPasswordController(new ResetPasswordUseCase(service), http),
      changePasswordController: new ChangePasswordController(new ChangePasswordUseCase(service), http),
      requestEmailChangeController: new RequestEmailChangeController(new RequestEmailChangeUseCase(service), http),
      confirmEmailChangeController: new ConfirmEmailChangeController(new ConfirmEmailChangeUseCase(service), http),
      confirmEmailChangeByLinkController: new ConfirmEmailChangeByLinkController(new ConfirmEmailChangeByLinkUseCase(service), http),
      trustCurrentDeviceController: new TrustCurrentDeviceController(new TrustCurrentDeviceUseCase(service), http),
      removeCurrentDeviceController: new RemoveCurrentDeviceController(new RemoveCurrentDeviceUseCase(service), http),
      startOAuthController: new StartOAuthController(new StartOAuthUseCase(service), http),
      oauthCallbackController: new OAuthCallbackController(new OAuthCallbackUseCase(service), http),
      completeOAuthRegistrationController: new CompleteOAuthRegistrationController(new CompleteOAuthRegistrationUseCase(service), http),
    });
  });
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
