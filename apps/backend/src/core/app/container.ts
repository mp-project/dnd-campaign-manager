import type { HistoryPort } from "#core/history/types";
import type { CampaignRole } from "#core/http/requestContext";
import type { AccountPort, IdentityPort } from "#core/auth/identity";
import type { Pool } from "pg";

import {
  createDrizzleDb,
  createTransactionManager,
  type AppDatabase,
  type TransactionManager,
} from "#core/db/pool";
import type { AppEnv } from "#core/env";
import { getErrorReporter, type ErrorReporter } from "#core/log/errorReporter";
import {
  createPermissionService,
  type PermissionService,
} from "#core/permissions/service";
import {
  createUnknownCampaignFactPort,
  type CampaignFactPort as BaseCampaignFactPort,
} from "#core/app/campaignFactPort";
import {
  createStoragePortFromEnv,
  type StoragePort,
} from "#core/storage";
import { createEmailPortFromEnv, type EmailPort } from "#core/email/index";
import { createCacheStore, type CacheStore } from "#core/cache/index";
import type { Redis } from "#core/redis/client";
import { InProcessEventBus, type EventBus } from "#core/events/EventBus";
import type { FastifyBaseLogger } from "fastify";

export type CampaignAccessFacts = {
  campaignId: string;
  rulesetId: string;
  campaignMemberId: string | null;
  membershipActive: boolean;
  /** Null when the actor is neither owner nor active member. */
  campaignRole: CampaignRole | null;
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
  campaignFactPort?: CampaignFactPort;
  storagePort?: StoragePort;
  emailPort?: EmailPort;
  /** Shared through Redis when the app has one, else per process. */
  cacheStore?: CacheStore;
  /** Set by the history module during registration. */
  history?: HistoryPort;
  /** The identity provider; set by the auth module unless provided. Without it nobody is signed in. */
  identityPort?: IdentityPort;
  /** Maps identities to local accounts; set by the auth module unless provided. */
  accountPort?: AccountPort;
  /** Unexpected errors besides the log; the one installed for the process unless provided. */
  errorReporter?: ErrorReporter;
  /** Domain events after the commit, in this process; see `#core/events`. */
  eventBus?: EventBus;
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
  /** `eventBus` and `cacheStore` are always set: overrides replace them, but can't leave them out. */
  ports: AppPublicPorts & { eventBus: EventBus; cacheStore: CacheStore };
  dependencies: DependencyRegistry;
};

type CreateAppContainerParams = {
  config: AppEnv;
  pool: Pool;
  /** The app's Redis client; without it the ports that would use it work per process. */
  redis?: Redis;
  /** For errors of event handlers; without it they go to the log of the current request. */
  logger?: FastifyBaseLogger;
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
  const campaignFactPort =
    params.publicPorts?.campaignFactPort ?? {
      ...createUnknownCampaignFactPort(),
      resolveCampaignAccess: async () => null,
    };
  const storagePort =
    params.publicPorts?.storagePort ?? createStoragePortFromEnv(params.config);
  const emailPort =
    params.publicPorts?.emailPort ?? createEmailPortFromEnv(params.config);
  const errorReporter = params.publicPorts?.errorReporter ?? getErrorReporter();
  const cacheStore = params.publicPorts?.cacheStore ?? createCacheStore(params.redis);
  const eventBus =
    params.publicPorts?.eventBus ?? new InProcessEventBus(params.logger, errorReporter);

  return {
    config: params.config,
    pool: params.pool,
    db,
    transactionManager: createTransactionManager(db),
    dependencies: createDependencyRegistry(),
    ports: {
      ...params.publicPorts,
      permissionService,
      campaignFactPort,
      storagePort,
      emailPort,
      errorReporter,
      cacheStore,
      eventBus,
    },
  };
}
