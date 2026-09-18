import "fastify";

import type { CampaignContext, RequestContext, SystemRole } from "#core/http/request-context";

type VerifiedAccessToken = {
  actorId: string;
  systemRole: SystemRole;
};

declare module "fastify" {
  interface FastifyRequest {
    authToken: string | null;
    verifiedAccessToken: VerifiedAccessToken | null;
    requestContext: RequestContext;
    campaignContext: CampaignContext | null;
  }
}
