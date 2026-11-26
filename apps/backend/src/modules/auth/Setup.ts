import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { AccountRepository } from "#src/modules/auth/domain/repository/AccountRepository";
import { InvalidateAccountCacheHandler } from "#src/modules/auth/events/InvalidateAccountCacheHandler";
import { PublishAccountChangesHandler } from "#src/modules/auth/events/PublishAccountChangesHandler";
import { HandleClerkWebhookController } from "#src/modules/auth/http/controller/HandleClerkWebhookController";
import { registerAuthRoutes } from "#src/modules/auth/http/routes/v1/AuthRoutes";
import { ROLE_PERMISSIONS } from "#src/modules/auth/permissions/roles";
import { AccountCache } from "#src/modules/auth/service/AccountCache";
import { AccountService } from "#src/modules/auth/service/AccountService";
import { createClerkIdentityPort } from "#src/modules/auth/service/ClerkIdentityPort";
import { HandleClerkWebhookUseCase } from "#src/modules/auth/useCase/HandleClerkWebhookUseCase";

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
  if (!container.ports.identityPort) {
    const identityPort = createClerkIdentityPort(config);

    if (identityPort) container.ports.identityPort = identityPort;
  }

  const accountCache = new AccountCache(container.ports.cacheStore);
  const accountService = new AccountService(
    container.db,
    container.transactionManager,
    new AccountRepository(),
    container.ports.identityPort,
    accountCache,
    { bootstrapMaintainerEmail: config.BOOTSTRAP_MAINTAINER_EMAIL },
  );

  // Cache first: a client disconnected by the next handler connects again with the fresh account.
  container.ports.eventBus.register(new InvalidateAccountCacheHandler(accountCache));
  container.ports.eventBus.register(new PublishAccountChangesHandler(container.ports.realtime));

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
