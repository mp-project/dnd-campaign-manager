import "fastify";

import type { CampaignContext, RequestContext, SystemRole } from "#core/http/requestContext";
import type { RoutePermissionConfig } from "#core/http/authorization";

type VerifiedAccessToken = {
  actorId: string;
  systemRole: SystemRole;
};

declare module "fastify" {
  interface FastifyContextConfig {
    permission?: RoutePermissionConfig;
  }

  interface FastifyRequest {
    authToken: string | null;
    verifiedAccessToken: VerifiedAccessToken | null;
    requestContext: RequestContext;
    campaignContext: CampaignContext | null;
  }
}
