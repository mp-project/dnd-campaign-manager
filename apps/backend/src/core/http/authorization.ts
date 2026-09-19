import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { CampaignContext } from "#core/http/requestContext";

export type RoutePermissionConfig = {
  key: string;
  hideAsNotFoundForPlayers?: boolean;
};

type RouteConfigWithPermission = {
  permission?: RoutePermissionConfig;
};

function resolveRoutePermissionConfig(
  request: FastifyRequest,
): RoutePermissionConfig | null {
  const routeConfig = request.routeOptions.config as RouteConfigWithPermission | undefined;

  return routeConfig?.permission ?? null;
}

function toGlobalContext(request: FastifyRequest): CampaignContext {
  return {
    actorId: request.requestContext.actorId,
    systemRole: request.requestContext.systemRole,
    campaignId: "global",
    rulesetId: "global",
    campaignMemberId: null,
    campaignRole: null,
    permissions: [],
  };
}

export function registerAuthorizationPlugin(
  app: FastifyInstance,
  container: AppContainer,
): void {
  app.addHook("preHandler", async (request) => {
    const permissionConfig = resolveRoutePermissionConfig(request);

    if (!permissionConfig) {
      return;
    }

    const permissionService = container.ports.permissionService;

    if (!permissionService) {
      return;
    }

    const context = request.campaignContext ?? toGlobalContext(request);

    if (permissionConfig.hideAsNotFoundForPlayers === undefined) {
      permissionService.require(permissionConfig.key, context);

      return;
    }

    permissionService.require(permissionConfig.key, context, undefined, {
      hideAsNotFoundForPlayers: permissionConfig.hideAsNotFoundForPlayers,
    });
  });
}
