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

export function registerAuthPlugin(app: FastifyInstance): void {
  app.decorateRequest("authToken", null as string | null);
  app.decorateRequest("verifiedAccessToken", null as VerifiedAccessToken | null);

  app.addHook("onRequest", async (request) => {
    authenticate(request);
  });
}

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

export function registerRequestContextPlugin(app: FastifyInstance): void {
  app.decorateRequest("requestContext", null as unknown as RequestContext);

  app.addHook("preHandler", async (request) => {
    request.requestContext = resolveRequestContext(request);
  });
}

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

export function registerCampaignContextPlugin(
  app: FastifyInstance,
  container: AppContainer,
): void {
  app.decorateRequest("campaignContext", null as CampaignContext | null);

  app.addHook("preHandler", async (request) => {
    request.campaignContext = await resolveCampaignContext(request, container);
  });
}
