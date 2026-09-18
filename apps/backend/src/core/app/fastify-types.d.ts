import "fastify";

import type { RequestContext } from "../http/request-context.js";

declare module "fastify" {
  interface FastifyRequest {
    authToken: string | null;
    requestContext: RequestContext;
  }
}
