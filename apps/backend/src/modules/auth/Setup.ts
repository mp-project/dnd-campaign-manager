import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { AccountRepository } from "#src/modules/auth/domain/repository/AccountRepository";
import { HandleClerkWebhookController } from "#src/modules/auth/http/controller/HandleClerkWebhookController";
import { registerAuthRoutes } from "#src/modules/auth/http/routes/v1/AuthRoutes";
import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";
import { AccountService } from "#src/modules/auth/service/AccountService";
import { ClerkIdentityPort } from "#src/modules/auth/service/ClerkIdentityPort";
import { HandleClerkWebhookUseCase } from "#src/modules/auth/useCase/HandleClerkWebhookUseCase";

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Connects the app to the identity provider (Clerk): the identity port confirms sessions, the
 * account service maps them to local accounts, the webhook keeps the copies in step. Rights stay
 * here too (system roles and the aggregation of all permission keys).
 */
async function registerAuthModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  container.ports.permissionService?.registerSystemRolePermissions(ROLE_PERMISSIONS);

  const config = container.config;

  // Tests provide their own port; without a secret key nobody is signed in (named at start by
  // `warnMissingIntegrations`).
  if (!container.ports.identityPort && config.CLERK_SECRET_KEY) {
    container.ports.identityPort = new ClerkIdentityPort({
      secretKey: config.CLERK_SECRET_KEY,
      jwtKey: config.CLERK_JWT_KEY,
      authorizedParties: splitList(config.CLERK_AUTHORIZED_PARTIES ?? config.FRONTEND_ORIGIN),
    });
  }

  const accountService = new AccountService(
    container.db,
    container.transactionManager,
    new AccountRepository(),
    container.ports.identityPort,
    { bootstrapMaintainerEmail: config.BOOTSTRAP_MAINTAINER_EMAIL },
  );

  container.ports.accountPort ??= accountService;

  app.register(async (authApp) => {
    registerAuthRoutes(authApp, {
      handleClerkWebhookController: new HandleClerkWebhookController(
        new HandleClerkWebhookUseCase(accountService, config.CLERK_WEBHOOK_SIGNING_SECRET),
      ),
    });
  });
}

export const authModule: AppModule = {
  name: "auth",
  dependencies: ["system"],
  register: registerAuthModule,
};
