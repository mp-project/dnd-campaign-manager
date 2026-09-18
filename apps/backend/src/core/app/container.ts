import type { Pool } from "pg";

import {
  createDrizzleDb,
  createTransactionManager,
  type AppDatabase,
  type TransactionManager,
} from "../db/pool.js";
import type { AppEnv } from "../env.js";

export type AppPublicPorts = {
  permissionService?: unknown;
  relationRegistry?: unknown;
  usageProviderRegistry?: unknown;
  sessionProviderRegistry?: unknown;
  campaignFactPort?: unknown;
};

export type AppContainer = {
  config: AppEnv;
  pool: Pool;
  db: AppDatabase;
  transactionManager: TransactionManager;
  ports: AppPublicPorts;
};

type CreateAppContainerParams = {
  config: AppEnv;
  pool: Pool;
  publicPorts?: AppPublicPorts;
};

export function createAppContainer(params: CreateAppContainerParams): AppContainer {
  const db = createDrizzleDb(params.pool);

  return {
    config: params.config,
    pool: params.pool,
    db,
    transactionManager: createTransactionManager(db),
    ports: params.publicPorts ?? {},
  };
}
