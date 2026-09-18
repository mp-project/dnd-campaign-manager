import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AppContainer, CampaignAccessFacts } from "#core/app/container";
import type { AppEnv } from "#core/env";
import type {
  CampaignContext,
  RequestContext,
  SystemRole,
} from "#core/http/request-context";

type VerifiedAccessToken = {
  actorId: string;
  systemRole: SystemRole;
};

/**
 * Parses a lightweight bearer token format used in local/dev flows.
 *
 * @param token Bearer token value.
 * @returns Verified token payload or null when token format is invalid.
 */
function verifyAccessToken(token: string): VerifiedAccessToken | null {
  if (token === "system-admin") {
    return {
      actorId: "system-admin",
      systemRole: "ADMIN",
    };
  }

  if (token.startsWith("admin:")) {
    const actorId = token.slice("admin:".length).trim();

    if (!actorId) {
      return null;
    }

    return {
      actorId,
      systemRole: "ADMIN",
    };
  }

  if (token.startsWith("user:")) {
    const actorId = token.slice("user:".length).trim();

    if (!actorId) {
      return null;
    }

    return {
      actorId,
      systemRole: "USER",
    };
  }

  if (!token.trim()) {
    return null;
  }

  return {
    actorId: token,
    systemRole: "USER",
  };
}

/**
 * Resolves campaign access facts from the campaign fact port with a safe fallback.
 *
 * @param container Application container with optional campaign fact port.
 * @param campaignId Target campaign id.
 * @param actorId Actor id from request context.
 * @returns Campaign access facts used to build campaign context.
 */
async function resolveCampaignAccessFacts(
  container: AppContainer,
  campaignId: string,
  actorId: string | null,
): Promise<CampaignAccessFacts> {
  const facts = await container.ports.campaignFactPort?.resolveCampaignAccess({
    campaignId,
    actorId,
  });

  if (facts) {
    return facts;
  }

  return {
    campaignId,
    rulesetId: "ruleset-default",
    campaignMemberId: null,
    campaignRole: null,
    membershipActive: false,
  };
}

/**
 * Extracts campaign id from route params first, then fallback header.
 *
 * @param request Fastify request.
 * @returns Campaign id or null when no campaign scope is provided.
 */
function extractCampaignId(request: FastifyRequest): string | null {
  const params = request.params as Record<string, unknown>;
  const campaignIdFromParams =
    params && typeof params.campaignId === "string" ? params.campaignId : null;

  if (campaignIdFromParams) {
    return campaignIdFromParams;
  }

  const campaignIdHeader = request.headers["x-campaign-id"];

  if (typeof campaignIdHeader === "string" && campaignIdHeader.trim()) {
    return campaignIdHeader.trim();
  }

  return null;
}

/**
 * Registers global rate limiting and CORS policies.
 *
 * @param app Fastify app instance.
 * @param env Validated application environment.
 */
export function registerSecurityPlugins(app: FastifyInstance, env: AppEnv): void {
  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
  });

  app.register(cors, {
    origin:
      env.CORS_ORIGIN === "*"
        ? true
        : env.CORS_ORIGIN.split(",").map((value) => value.trim()),
  });
}

/**
 * Authenticates a request by parsing and verifying bearer token headers.
 *
 * @param request Fastify request to enrich with auth fields.
 */
export function authenticate(request: FastifyRequest): void {
  const authorizationHeader = request.headers.authorization;

  request.authToken = null;
  request.verifiedAccessToken = null;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return;
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();

  if (!token) {
    return;
  }

  const verifiedToken = verifyAccessToken(token);

  if (!verifiedToken) {
    return;
  }

  request.authToken = token;
  request.verifiedAccessToken = verifiedToken;
}

/**
 * Registers request decorations and onRequest auth hook.
 *
 * @param app Fastify app instance.
 */
export function registerAuthPlugin(app: FastifyInstance): void {
  app.decorateRequest("authToken", null as string | null);
  app.decorateRequest("verifiedAccessToken", null as VerifiedAccessToken | null);

  app.addHook("onRequest", async (request) => {
    authenticate(request);
  });
}

/**
 * Builds request-level actor context from verified auth data.
 *
 * @param request Fastify request.
 * @returns Request context with actor and system role.
 */
export function resolveRequestContext(request: FastifyRequest): RequestContext {
  if (!request.verifiedAccessToken) {
    return {
      actorId: null,
      systemRole: "USER",
    };
  }

  return {
    actorId: request.verifiedAccessToken.actorId,
    systemRole: request.verifiedAccessToken.systemRole,
  };
}

/**
 * Registers requestContext decoration and preHandler population hook.
 *
 * @param app Fastify app instance.
 */
export function registerRequestContextPlugin(app: FastifyInstance): void {
  app.decorateRequest("requestContext", null as unknown as RequestContext);

  app.addHook("preHandler", async (request) => {
    request.requestContext = resolveRequestContext(request);
  });
}

/**
 * Resolves campaign-scoped context and effective permissions for a request.
 *
 * @param request Fastify request.
 * @param container Application container.
 * @returns Campaign context or null when request is not campaign-scoped.
 */
export async function resolveCampaignContext(
  request: FastifyRequest,
  container: AppContainer,
): Promise<CampaignContext | null> {
  const campaignId = extractCampaignId(request);

  if (!campaignId) {
    return null;
  }

  const baseContext = request.requestContext;
  const accessFacts = await resolveCampaignAccessFacts(
    container,
    campaignId,
    baseContext.actorId,
  );

  const campaignContext: CampaignContext = {
    actorId: baseContext.actorId,
    systemRole: baseContext.systemRole,
    campaignId: accessFacts.campaignId,
    rulesetId: accessFacts.rulesetId,
    campaignMemberId: accessFacts.membershipActive
      ? accessFacts.campaignMemberId
      : null,
    campaignRole: accessFacts.membershipActive ? accessFacts.campaignRole : null,
    permissions: [],
  };

  const effectivePermissions =
    container.ports.permissionService?.listEffectivePermissions(campaignContext) ??
    [];

  campaignContext.permissions = effectivePermissions;

  return campaignContext;
}

/**
 * Registers campaignContext decoration and preHandler resolution hook.
 *
 * @param app Fastify app instance.
 * @param container Application container.
 */
export function registerCampaignContextPlugin(
  app: FastifyInstance,
  container: AppContainer,
): void {
  app.decorateRequest("campaignContext", null as CampaignContext | null);

  app.addHook("preHandler", async (request) => {
    request.campaignContext = await resolveCampaignContext(request, container);
  });
}
