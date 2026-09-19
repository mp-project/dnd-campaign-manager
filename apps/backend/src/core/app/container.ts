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
  SessionContentProviderRegistry,
  UsageProviderRegistry,
} from "#core/app/moduleDependencies";
import {
  createUnknownCampaignFactPort,
  type CampaignFactPort as BaseCampaignFactPort,
} from "#core/app/campaignFactPort";
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
  hasVisitedLocation: BaseCampaignFactPort["hasVisitedLocation"];
  hasMetNpc: BaseCampaignFactPort["hasMetNpc"];
  hasResolvedEncounter: BaseCampaignFactPort["hasResolvedEncounter"];
  isQuestCompleted: BaseCampaignFactPort["isQuestCompleted"];
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

export type DependencyRegistry = {
  set<T>(token: string, dependency: T): void;
  get<T>(token: string): T | undefined;
  require<T>(token: string): T;
};

export type AppContainer = {
  config: AppEnv;
  pool: Pool;
  db: AppDatabase;
  transactionManager: TransactionManager;
  ports: AppPublicPorts;
  dependencies: DependencyRegistry;
};

type CreateAppContainerParams = {
  config: AppEnv;
  pool: Pool;
  publicPorts?: AppPublicPorts;
};

function createDependencyRegistry(): DependencyRegistry {
  const entries = new Map<string, unknown>();

  return {
    set: (token, dependency) => {
      entries.set(token, dependency);
    },
    get: <T>(token: string) => {
      return entries.get(token) as T | undefined;
    },
    require: <T>(token: string) => {
      const dependency = entries.get(token);

      if (dependency === undefined) {
        throw new Error(`Missing dependency registration for '${token}'`);
      }

      return dependency as T;
    },
  };
}

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
    dependencies: createDependencyRegistry(),
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
