import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";

import type { AppContainer, CampaignAccessFacts } from "#core/app/container";
import type { ResolvedActor } from "#core/auth/identity";
import type { AppEnv } from "#core/env";
import { uuidDto } from "#core/http/dto";
import { ROUTE_RATE_LIMIT, buildRateLimitKey } from "#core/http/rateLimit";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import type { CampaignContext, RequestContext } from "#core/http/requestContext";

function extractBearerToken(request: FastifyRequest): string | null {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim() || null;
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
    membershipActive: false,
    campaignRole: null,
  };
}

/**
 * Extracts campaign id from route params first, then fallback header.
 *
 * @param request Fastify request.
 * @returns Campaign id or null when no campaign scope (or no valid UUID) is provided.
 */
function extractCampaignId(request: FastifyRequest): string | null {
  const params = request.params as Record<string, unknown>;
  const campaignIdFromParams =
    params && typeof params.campaignId === "string" ? params.campaignId : null;

  const campaignIdHeader = request.headers["x-campaign-id"];
  const campaignId =
    campaignIdFromParams ??
    (typeof campaignIdHeader === "string" && campaignIdHeader.trim()
      ? campaignIdHeader.trim()
      : null);

  // Context resolution runs before schema validation; malformed ids are left to the route
  // schema (400) instead of reaching the database.
  return campaignId && uuidDto.safeParse(campaignId).success ? campaignId : null;
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
    ...ROUTE_RATE_LIMIT,
    keyGenerator: buildRateLimitKey,
    // One entry per user and route; the default of 5000 would evict active counters.
    cache: 50_000,
  });

  app.register(cors, {
    origin:
      env.CORS_ORIGIN === "*"
        ? true
        : env.CORS_ORIGIN.split(",").map((value) => value.trim()),
    credentials: true,
  });
}

/**
 * Authenticates a request: the identity port confirms the provider's session token, the account
 * port maps it to the local account (creating it on the first request) and supplies the current
 * role. A valid token of a locked or disabled account is no identity. Without both ports nobody
 * is signed in.
 *
 * @param request Fastify request to enrich with auth fields.
 * @param container Application container holding the identity and account ports.
 */
export async function authenticate(
  request: FastifyRequest,
  container: AppContainer,
): Promise<void> {
  request.authenticatedActor = null;
  request.authSessionId = null;

  const { identityPort, accountPort } = container.ports;

  if (!identityPort || !accountPort || !extractBearerToken(request)) {
    return;
  }

  const identity = await identityPort.authenticate(request);

  if (!identity) {
    return;
  }

  const actor = await accountPort.resolveActor(identity);

  if (!actor) {
    return;
  }

  request.authenticatedActor = actor;
  request.authSessionId = identity.sessionId;
}

/**
 * Registers request decorations and onRequest auth hook.
 *
 * @param app Fastify app instance.
 * @param container Application container holding the identity and account ports.
 */
export function registerAuthPlugin(app: FastifyInstance, container: AppContainer): void {
  app.decorateRequest("authenticatedActor", null as ResolvedActor | null);
  app.decorateRequest("authSessionId", null as string | null);

  app.addHook("onRequest", async (request) => {
    await authenticate(request, container);
  });
}

/**
 * Builds request-level actor context from verified auth data.
 *
 * @param request Fastify request.
 * @returns Request context with actor and system role.
 */
export function resolveRequestContext(request: FastifyRequest): RequestContext {
  if (!request.authenticatedActor) {
    return {
      actorId: null,
      systemRole: SYSTEM_ROLE.USER,
    };
  }

  return {
    actorId: request.authenticatedActor.actorId,
    systemRole: request.authenticatedActor.systemRole,
  };
}

/**
 * Registers requestContext decoration and preValidation population hook.
 *
 * @param app Fastify app instance.
 */
export function registerRequestContextPlugin(app: FastifyInstance): void {
  app.decorateRequest("requestContext", null as unknown as RequestContext);

  // preValidation, so authentication and authorization run before request schema validation.
  app.addHook("preValidation", async (request) => {
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
 * Registers campaignContext decoration and preValidation resolution hook.
 *
 * @param app Fastify app instance.
 * @param container Application container.
 */
export function registerCampaignContextPlugin(
  app: FastifyInstance,
  container: AppContainer,
): void {
  app.decorateRequest("campaignContext", null as CampaignContext | null);

  app.addHook("preValidation", async (request) => {
    request.campaignContext = await resolveCampaignContext(request, container);
  });
}
