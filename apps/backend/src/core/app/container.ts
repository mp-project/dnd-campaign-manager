import type { HistoryPort } from "#core/history/types";
import type { SystemRole } from "#core/permissions/roles";
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
  createUnknownCampaignFactPort,
  type CampaignFactPort as BaseCampaignFactPort,
} from "#core/app/campaignFactPort";
import {
  createStoragePortFromEnv,
  type StoragePort,
} from "#core/storage";
import { createEmailPortFromEnv, type EmailPort } from "#core/email/index";

export type CampaignAccessFacts = {
  campaignId: string;
  rulesetId: string;
  campaignMemberId: string | null;
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

/**
 * Checks a verified access token against the current account state, so a lock, a role change,
 * a password change or a logout everywhere ends the token at once. Returns the role to use for
 * the request, or null when the token no longer counts.
 */
export type SessionStatePort = {
  resolveActor(input: {
    actorId: string;
    systemRole: SystemRole;
    sessionVersion: number | null;
  }): Promise<{ systemRole: SystemRole } | null>;
};

export type AppPublicPorts = {
  permissionService?: PermissionService;
  campaignFactPort?: CampaignFactPort;
  storagePort?: StoragePort;
  emailPort?: EmailPort;
  /** Set by the history module during registration. */
  history?: HistoryPort;
  /** Set by the auth module unless provided. Without it, no access token is accepted. */
  sessionStatePort?: SessionStatePort;
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
  const campaignFactPort =
    params.publicPorts?.campaignFactPort ?? {
      ...createUnknownCampaignFactPort(),
      resolveCampaignAccess: async () => null,
    };
  const storagePort =
    params.publicPorts?.storagePort ?? createStoragePortFromEnv(params.config);
  const emailPort =
    params.publicPorts?.emailPort ?? createEmailPortFromEnv(params.config);

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
    },
  };
}
