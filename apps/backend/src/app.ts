import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import Fastify, { LogController, type FastifyInstance } from "fastify";
import type { Pool } from "pg";

import {
  createAppContainer,
  type AppPublicPorts,
} from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import {
  checkDatabaseReadiness,
  createPgPool,
  type ReadyState,
} from "#core/db/pool";
import { getEnv, type AppEnv } from "#core/env";
import { API_BASE_PATH } from "#core/config/constants";
import { registerErrorHandler } from "#core/error/registerErrorHandler";
import { registerAuthorizationPlugin } from "#core/http/authorization";
import { registerApiRoutes } from "#core/http/registerApiRoutes";
import { registerOpenApi } from "#core/http/registerOpenApi";
import {
  registerAuthPlugin,
  registerCampaignContextPlugin,
  registerRequestContextPlugin,
  registerSecurityPlugins,
} from "#core/http/securityAndContext";
import {
  notFound,
  registerHealthRoutes,
} from "#core/http/systemRoutes";
import {
  defaultAppModules,
} from "#src/modules/index";

type BuildAppOptions = {
  env?: AppEnv;
  pool?: Pool;
  readyProbe?: () => Promise<ReadyState>;
  modules?: readonly AppModule[];
  publicPorts?: AppPublicPorts;
  closePoolOnShutdown?: boolean;
};

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
  const modules = options.modules ?? defaultAppModules;
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

  registerSecurityPlugins(app, env);
  registerAuthPlugin(app, env);
  registerRequestContextPlugin(app);
  registerCampaignContextPlugin(app, container);
  registerAuthorizationPlugin(app, container);
  registerErrorHandler(app, env);
  registerOpenApi(app);
  registerHealthRoutes(app, readyProbe);
  registerApiRoutes(app, container, modules, API_BASE_PATH);

  app.setNotFoundHandler(async (request, reply) => {
    return notFound(request, reply);
  });

  if (closePoolOnShutdown) {
    app.addHook("onClose", async () => {
      await pool.end();
    });
  }

  return app;
}
