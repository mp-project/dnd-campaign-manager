import { createHmac, randomBytes } from "node:crypto";
import { AsyncResource } from "node:async_hooks";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AppEnv } from "#core/env";
import { runWithLogContext, type LogContext } from "#core/log/logContext";
import type { LogLevel } from "#core/log/logger";

/** Probes of the orchestration would fill the log; they are written on `debug`. */
const PROBE_ROUTES = new Set(["/health", "/ready", "/api/v1/ping"]);

const USER_AGENT_MAX_LENGTH = 120;

const errorCodes = new WeakMap<FastifyRequest, string>();
const logContexts = new WeakMap<FastifyRequest, LogContext>();
const asyncResources = new WeakMap<FastifyRequest, AsyncResource>();

/** The code of the error envelope sent for this request, for its `request` line. */
export function markResponseError(request: FastifyRequest, code: string): void {
  errorCodes.set(request, code);
}

/** 401/403/404/409/412 are normal answers; 400/413/429 can point at a broken or abusive client. */
export function requestLogLevel(statusCode: number, route: string | undefined): LogLevel {
  const isProbe = route !== undefined && PROBE_ROUTES.has(route);

  if (statusCode >= 500) {
    // A probe that fails is the orchestration's business; the cause is logged where it happens.
    return isProbe ? "warn" : "error";
  }

  if (statusCode === 400 || statusCode === 413 || statusCode === 429) {
    return "warn";
  }

  if (isProbe) {
    return "debug";
  }

  return "info";
}

function createIpHasher(secret: string | undefined): (ip: string) => string {
  // Without a configured key the hashes only match within one process, which is still enough to
  // spot one client hammering the API.
  const key = secret ?? randomBytes(32).toString("hex");

  return (ip) => createHmac("sha256", key).update(ip).digest("hex").slice(0, 16);
}

function pathWithoutQuery(url: string): string {
  const index = url.indexOf("?");

  return index === -1 ? url : url.slice(0, index);
}

/**
 * Request id and actor for every line written while a request runs, and one `request` line when
 * it is answered. Fastify's own request lines stay off.
 *
 * Register before the auth and context plugins: the context opens in the first `onRequest` hook,
 * and the actor and campaign are filled in after they are known.
 */
export function registerRequestLogging(app: FastifyInstance, env: AppEnv): void {
  const hashIp = createIpHasher(env.LOG_IP_HASH_SECRET);

  app.addHook("onRequest", (request, _reply, done) => {
    const context: LogContext = {
      requestId: request.id,
      logger: app.log,
      changeValues: env.LOG_CHANGE_VALUES,
    };

    logContexts.set(request, context);
    runWithLogContext(context, () => {
      // Body parsing runs outside the hook chain and loses the context; `preValidation` enters it
      // again through this resource (the approach of @fastify/request-context).
      asyncResources.set(request, new AsyncResource("request-log-context"));
      done();
    });
  });

  app.addHook("preValidation", (request, _reply, done) => {
    const resource = asyncResources.get(request);

    if (resource) {
      resource.runInAsyncScope(done, request.raw);
    } else {
      done();
    }
  });

  app.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    const route = request.routeOptions.url;
    const statusCode = reply.statusCode;
    const context = logContexts.get(request);
    const contentLength = reply.getHeader("content-length");
    const userAgent = request.headers["user-agent"];

    request.log[requestLogLevel(statusCode, route)](
      {
        kind: "request",
        requestId: request.id,
        method: request.method,
        route: route ?? null,
        url: pathWithoutQuery(request.url),
        statusCode,
        durationMs: Math.round(reply.elapsedTime * 10) / 10,
        ...(context?.userId ? { userId: context.userId } : {}),
        ...(request.requestContext?.actorId ? { systemRole: request.requestContext.systemRole } : {}),
        ...(context?.campaignId ? { campaignId: context.campaignId } : {}),
        ...(request.campaignContext?.campaignRole
          ? { campaignRole: request.campaignContext.campaignRole }
          : {}),
        ...(errorCodes.has(request) ? { errorCode: errorCodes.get(request) } : {}),
        ipHash: hashIp(request.ip),
        ...(userAgent ? { userAgent: userAgent.slice(0, USER_AGENT_MAX_LENGTH) } : {}),
        ...(contentLength !== undefined ? { contentLength: Number(contentLength) } : {}),
      },
      "request",
    );
  });
}

/**
 * Adds actor and campaign to the request's log context. Register after the request and campaign
 * context plugins, so their `preValidation` hooks ran first.
 */
export function registerRequestLogActor(app: FastifyInstance): void {
  app.addHook("preValidation", async (request) => {
    const context = logContexts.get(request);

    if (!context) {
      return;
    }

    context.userId = request.requestContext?.actorId ?? null;
    context.campaignId = request.campaignContext?.campaignId ?? null;
  });
}
