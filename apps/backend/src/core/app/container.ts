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
  AssetRelationRegistry,
  AssetTypeRegistry,
  createUnknownCampaignFactPort,
  SessionContentProviderRegistry,
  type CampaignFactPort as ContractCampaignFactPort,
  UsageProviderRegistry,
} from "#core/contracts";
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
  hasVisitedLocation: ContractCampaignFactPort["hasVisitedLocation"];
  hasMetNpc: ContractCampaignFactPort["hasMetNpc"];
  hasResolvedEncounter: ContractCampaignFactPort["hasResolvedEncounter"];
  isQuestCompleted: ContractCampaignFactPort["isQuestCompleted"];
  resolveCampaignAccess(input: {
    campaignId: string;
    actorId: string | null;
  }): Promise<CampaignAccessFacts | null>;
};

export type AppPublicPorts = {
  permissionService?: PermissionService;
  assetTypeRegistry?: AssetTypeRegistry;
  relationRegistry?: AssetRelationRegistry;
  usageProviderRegistry?: UsageProviderRegistry;
  sessionProviderRegistry?: SessionContentProviderRegistry;
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

/**
 * Creates the application DI container with default core ports when not overridden.
 *
 * @param params Runtime config, database pool, and optional port overrides.
 * @returns Fully initialized application container.
 */
export function createAppContainer(params: CreateAppContainerParams): AppContainer {
  const db = createDrizzleDb(params.pool);
  const permissionService =
    params.publicPorts?.permissionService ?? createPermissionService();
  const assetTypeRegistry =
    params.publicPorts?.assetTypeRegistry ?? new AssetTypeRegistry();
  const relationRegistry =
    params.publicPorts?.relationRegistry ?? new AssetRelationRegistry();
  const usageProviderRegistry =
    params.publicPorts?.usageProviderRegistry ?? new UsageProviderRegistry();
  const sessionProviderRegistry =
    params.publicPorts?.sessionProviderRegistry ?? new SessionContentProviderRegistry();
  const campaignFactPort =
    params.publicPorts?.campaignFactPort ?? {
      ...createUnknownCampaignFactPort(),
      resolveCampaignAccess: async () => null,
    };
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
      assetTypeRegistry,
      relationRegistry,
      usageProviderRegistry,
      sessionProviderRegistry,
      campaignFactPort,
      storagePort,
    },
  };
}
