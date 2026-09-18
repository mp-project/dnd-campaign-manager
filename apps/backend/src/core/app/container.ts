import type { Pool } from "pg";

import {
  createDrizzleDb,
  createTransactionManager,
  type AppDatabase,
  type TransactionManager,
} from "#core/db/pool";
import type { AppEnv } from "#core/env";
import {
  createPermissionService,
  type PermissionService,
} from "#core/permissions/service";
import {
  createStoragePortFromEnv,
  type StoragePort,
} from "#core/storage";

export type CampaignAccessFacts = {
  campaignId: string;
  rulesetId: string;
  campaignMemberId: string | null;
  campaignRole: "EDITOR" | "PLAYER" | null;
  membershipActive: boolean;
};

export type CampaignFactPort = {
  resolveCampaignAccess(input: {
    campaignId: string;
    actorId: string | null;
  }): Promise<CampaignAccessFacts | null>;
};

export type AppPublicPorts = {
  permissionService?: PermissionService;
  relationRegistry?: unknown;
  usageProviderRegistry?: unknown;
  sessionProviderRegistry?: unknown;
  campaignFactPort?: CampaignFactPort;
  storagePort?: StoragePort;
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
  const permissionService =
    params.publicPorts?.permissionService ?? createPermissionService();
  const storagePort =
    params.publicPorts?.storagePort ?? createStoragePortFromEnv(params.config);

  return {
    config: params.config,
    pool: params.pool,
    db,
    transactionManager: createTransactionManager(db),
    ports: {
      ...params.publicPorts,
      permissionService,
      storagePort,
    },
  };
}
