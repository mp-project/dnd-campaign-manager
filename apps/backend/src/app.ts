import fastifyStatic from "@fastify/static";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

import {
  createAppContainer,
  type AppPublicPorts,
} from "#core/app/container";
import {
  resolveModuleRegistrationOrder,
  type AppModule,
} from "#core/app/module-system";
import {
  checkDatabaseReadiness,
  createPgPool,
  type ReadyState,
} from "#core/db/pool";
import { getEnv, type AppEnv } from "#core/env";
import { mapErrorToHttp } from "#core/http/error-mapper";
import { createErrorPayload } from "#core/http/error-payload";
import {
  registerAuthPlugin,
  registerCampaignContextPlugin,
  registerRequestContextPlugin,
  registerSecurityPlugins,
} from "#core/http/security-and-context";
import {
  notFound,
  registerApiBaseRoute,
  registerApiPingRoute,
  registerHealthRoutes,
} from "#core/http/system-routes";

type BuildAppOptions = {
  env?: AppEnv;
  pool?: Pool;
  readyProbe?: () => Promise<ReadyState>;
  staticRoot?: string;
  modules?: readonly AppModule[];
  publicPorts?: AppPublicPorts;
  closePoolOnShutdown?: boolean;
};

const SPA_FALLBACK_EXCLUDES = ["/api", "/documentation", "/health", "/ready"];
const backendSourceDir = path.dirname(fileURLToPath(import.meta.url));
const defaultStaticRoot = path.resolve(backendSourceDir, "../../frontend/dist");

const defaultAppModules: readonly AppModule[] = [
  {
    name: "system",
    dependencies: [],
    register: async (app) => {
      registerApiPingRoute(app);
    },
  },
];

function shouldServeSpaFallback(
  url: string,
  acceptHeader: string | undefined,
): boolean {
  if (!acceptHeader?.includes("text/html")) {
    return false;
  }

  const pathname = url.split("?")[0] ?? "/";

  return !SPA_FALLBACK_EXCLUDES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function registerErrorHandler(app: FastifyInstance, env: AppEnv): void {
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");

    const mappedError = mapErrorToHttp(error);
    const isInternalError = mappedError.code === "INTERNAL_ERROR";
    const shouldMaskInternalError = env.NODE_ENV === "production" && isInternalError;

    reply.code(mappedError.statusCode).send(
      createErrorPayload({
        code: shouldMaskInternalError ? "INTERNAL_ERROR" : mappedError.code,
        message: shouldMaskInternalError
          ? "Internal server error"
          : mappedError.message,
        details: shouldMaskInternalError ? null : mappedError.details,
        requestId: request.id,
      }),
    );
  });
}

function registerOpenApi(app: FastifyInstance): void {
  app.register(swagger, {
    openapi: {
      info: {
        title: "DnD Campaign Manager API",
        version: "0.1.0",
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  app.register(swaggerUI, {
    routePrefix: "/documentation",
  });
}

function registerApiRoutes(
  app: FastifyInstance,
  modules: readonly AppModule[],
  container: ReturnType<typeof createAppContainer>,
): void {
  app.register(
    async (apiApp) => {
      registerApiBaseRoute(apiApp);

      for (const module of modules) {
        await module.register(apiApp, container);
      }
    },
    { prefix: "/api/v1" },
  );
}

function registerModulePermissions(
  modules: readonly AppModule[],
  container: ReturnType<typeof createAppContainer>,
): void {
  const permissionService = container.ports.permissionService;

  if (!permissionService) {
    return;
  }

  for (const module of modules) {
    if (!module.permissions || module.permissions.length === 0) {
      continue;
    }

    permissionService.registerDefinitions(module.name, module.permissions);
  }
}

function registerStaticFrontend(app: FastifyInstance, staticRoot: string): void {
  if (!existsSync(staticRoot)) {
    return;
  }

  app.register(fastifyStatic, {
    root: staticRoot,
    prefix: "/",
    index: ["index.html"],
  });
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const env = options.env ?? getEnv();
  const baseApp = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    requestIdHeader: "x-request-id",
    logController: new LogController({
      disableRequestLogging: true,
    }),
  });

  baseApp.setValidatorCompiler(validatorCompiler);
  baseApp.setSerializerCompiler(serializerCompiler);
  const app = baseApp.withTypeProvider<ZodTypeProvider>();

  const pool = options.pool ?? createPgPool(env.DATABASE_URL);
  const closePoolOnShutdown =
    options.closePoolOnShutdown ?? options.pool === undefined;
  const readyProbe = options.readyProbe ?? (() => checkDatabaseReadiness(pool));
  const staticRoot = options.staticRoot ?? defaultStaticRoot;
  const indexHtmlPath = path.join(staticRoot, "index.html");
  const modules = resolveModuleRegistrationOrder(options.modules ?? defaultAppModules);
  const container = createAppContainer(
    options.publicPorts
      ? {
          config: env,
          pool,
          publicPorts: options.publicPorts,
        }
      : {
          config: env,
          pool,
        },
  );

  registerModulePermissions(modules, container);

  registerSecurityPlugins(app, env);
  registerAuthPlugin(app);
  registerRequestContextPlugin(app);
  registerCampaignContextPlugin(app, container);
  registerErrorHandler(app, env);
  registerOpenApi(app);
  registerHealthRoutes(app, readyProbe);
  registerApiRoutes(app, modules, container);
  registerStaticFrontend(app, staticRoot);

  app.setNotFoundHandler(async (request, reply) => {
    if (
      existsSync(indexHtmlPath) &&
      shouldServeSpaFallback(request.url, request.headers.accept)
    ) {
      return reply.type("text/html; charset=utf-8").sendFile("/index.html");
    }

    return notFound(request, reply);
  });

  if (closePoolOnShutdown) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
