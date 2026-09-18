import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

import type { AppEnv } from "../env.js";
import type { RequestContext } from "./request-context.js";

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

export function registerAuthPlugin(app: FastifyInstance): void {
  app.decorateRequest("authToken", null);

  app.addHook("onRequest", async (request) => {
    const authorizationHeader = request.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      request.authToken = null;
      return;
    }

    const token = authorizationHeader.slice("Bearer ".length).trim();
    request.authToken = token.length > 0 ? token : null;
  });
}

export function registerRequestContextPlugin(app: FastifyInstance): void {
  app.decorateRequest("requestContext", null as unknown as RequestContext);

  app.addHook("preHandler", async (request) => {
    if (request.authToken === "system-admin") {
      request.requestContext = {
        actorId: "system-admin",
        systemRole: "ADMIN",
      };
      return;
    }

    request.requestContext = {
      actorId: request.authToken,
      systemRole: "USER",
    };
  });
}
