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
} from "#core/app/moduleSystem";
import {
  checkDatabaseReadiness,
  createPgPool,
  type ReadyState,
} from "#core/db/pool";
import { getEnv, type AppEnv } from "#core/env";
import { mapErrorToHttp } from "#core/http/errorMapper";
import { createErrorPayload } from "#core/http/errorPayload";
import { registerAuthorizationPlugin } from "#core/http/authorization";
import {
  registerAuthPlugin,
  registerCampaignContextPlugin,
  registerRequestContextPlugin,
  registerSecurityPlugins,
} from "#core/http/securityAndContext";
import {
  notFound,
  registerApiBaseRoute,
  registerHealthRoutes,
} from "#core/http/systemRoutes";
import { appModules } from "#src/modules/index";

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
    const mappedError = mapErrorToHttp(error);
    const isTestRuntime =
      env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;

    if (!isTestRuntime) {
      request.log.error({ err: error }, "Unhandled request error");
    }

    const isInternalError = mappedError.code === "INTERNAL_ERROR";
    const shouldMaskInternalError =
      (env.NODE_ENV === "production" || env.NODE_ENV === "stage") &&
      isInternalError;

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
          cookieAuth: {
            type: "apiKey",
            in: "cookie",
            name: "access_token",
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

function registerModuleDependencies(
  modules: readonly AppModule[],
  container: ReturnType<typeof createAppContainer>,
): void {
  const assetTypeRegistry = container.ports.assetTypeRegistry;
  const relationRegistry = container.ports.relationRegistry;
  const usageProviderRegistry = container.ports.usageProviderRegistry;
  const sessionProviderRegistry = container.ports.sessionProviderRegistry;

  if (assetTypeRegistry) {
    for (const module of modules) {
      if (!module.assetTypes || module.assetTypes.length === 0) {
        continue;
      }

      assetTypeRegistry.register(module.name, module.assetTypes);
    }
  }

  if (relationRegistry && assetTypeRegistry) {
    for (const module of modules) {
      if (!module.relations || module.relations.length === 0) {
        continue;
      }

      relationRegistry.register(module.name, module.relations, assetTypeRegistry);
    }
  }

  if (usageProviderRegistry) {
    for (const module of modules) {
      if (!module.usageProviders || module.usageProviders.length === 0) {
        continue;
      }

      usageProviderRegistry.register(module.name, module.usageProviders);
    }
  }

  if (sessionProviderRegistry) {
    for (const module of modules) {
      if (!module.sessionProviders || module.sessionProviders.length === 0) {
        continue;
      }

      sessionProviderRegistry.register(module.name, module.sessionProviders);
    }
  }

  assetTypeRegistry?.freeze();
  relationRegistry?.freeze();
  usageProviderRegistry?.freeze();
  sessionProviderRegistry?.freeze();
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
  const modules = resolveModuleRegistrationOrder(options.modules ?? appModules);
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
  registerModuleDependencies(modules, container);

  registerSecurityPlugins(app, env);
  registerAuthPlugin(app, env);
  registerRequestContextPlugin(app);
  registerCampaignContextPlugin(app, container);
  registerAuthorizationPlugin(app, container);
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
