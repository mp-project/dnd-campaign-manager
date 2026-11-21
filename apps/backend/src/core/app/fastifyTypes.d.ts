import "fastify";

import type { ResolvedActor } from "#core/auth/identity";
import type { CampaignContext, RequestContext } from "#core/http/requestContext";
import type { RoutePermissionConfig } from "#core/http/authorization";


declare module "fastify" {
  interface FastifyContextConfig {
    permission?: RoutePermissionConfig;
    /** Reason an API route needs no permission; exactly one of the two must be set. */
    public?: string;
  }

  interface FastifyRequest {
    /** The signed-in local account, set by the `onRequest` auth hook. */
    authenticatedActor: ResolvedActor | null;
    /** The identity provider's session id of the request, for logs. */
    authSessionId: string | null;
    requestContext: RequestContext;
    campaignContext: CampaignContext | null;
  }
}
