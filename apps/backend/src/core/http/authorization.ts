import type { FastifyInstance, FastifyRequest, RouteOptions } from "fastify";

import type { AppContainer } from "#core/app/container";
import { ForbiddenError } from "#core/error/http/index";
import type { CampaignContext } from "#core/http/requestContext";

export type RoutePermissionConfig = {
  key: string;
  hideAsNotFoundForPlayers?: boolean;
};

/**
 * Every API route declares either the permission it needs or why it is open to everybody.
 */
export type RouteAccessConfig = {
  permission?: RoutePermissionConfig;
  /** Reason the route needs no permission, e.g. "sign-in" or "checks the token itself". */
  public?: string;
};

function resolveRouteAccessConfig(request: FastifyRequest): RouteAccessConfig {
  return (request.routeOptions.config as RouteAccessConfig | undefined) ?? {};
}

function toGlobalContext(request: FastifyRequest): CampaignContext {
  return {
    actorId: request.requestContext.actorId,
    systemRole: request.requestContext.systemRole,
    campaignId: "global",
    rulesetId: "global",
    campaignMemberId: null,
    permissions: [],
  };
}

function hasCampaignRouteParam(request: FastifyRequest): boolean {
  const params = request.params as Record<string, unknown> | undefined;

  return typeof params?.campaignId === "string";
}

/**
 * Refuses to register an API route that neither names a permission nor gives a reason for being
 * public, so a forgotten `config.permission` fails at startup instead of opening the route.
 */
export function assertRouteDeclaresAccess(route: RouteOptions, protectedPrefix: string): void {
  if (!route.url.startsWith(protectedPrefix)) {
    return;
  }

  const config = (route.config as RouteAccessConfig | undefined) ?? {};
  const hasPermission = Boolean(config.permission?.key);
  const hasPublicReason = typeof config.public === "string" && config.public.trim().length > 0;

  if (hasPermission === hasPublicReason) {
    throw new Error(
      `Route ${String(route.method)} ${route.url} must set exactly one of ` +
        "config.permission or config.public",
    );
  }
}

export function registerAuthorizationPlugin(
  app: FastifyInstance,
  container: AppContainer,
  options: { protectedPrefix: string },
): void {
  app.addHook("onRoute", (route) => {
    assertRouteDeclaresAccess(route, options.protectedPrefix);
  });

  app.addHook("preValidation", async (request) => {
    const config = resolveRouteAccessConfig(request);
    const permissionConfig = config.permission;

    if (!permissionConfig) {
      // Routes outside the API prefix (health, docs) and declared public routes.
      return;
    }

    const permissionService = container.ports.permissionService;

    if (!permissionService) {
      throw new ForbiddenError("Insufficient permissions");
    }

    const context = request.campaignContext ?? toGlobalContext(request);

    permissionService.require(
      permissionConfig.key,
      context,
      undefined,
      permissionConfig.hideAsNotFoundForPlayers === undefined
        ? {}
        : { hideAsNotFoundForPlayers: permissionConfig.hideAsNotFoundForPlayers },
    );

    // Campaign roles only apply when the campaign comes from the route itself; a client header
    // on a global route must not change its rules.
    if (request.campaignContext && hasCampaignRouteParam(request)) {
      permissionService.requireCampaignRole(permissionConfig.key, request.campaignContext);
    }
  });
}
