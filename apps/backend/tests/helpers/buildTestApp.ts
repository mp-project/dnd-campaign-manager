import type { InjectOptions, Response as InjectResponse } from "light-my-request";

import { buildApp } from "#src/app";
import type { AppModule } from "#core/app/moduleSystem";
import type { AppPublicPorts } from "#core/app/container";
import type { AppEnv } from "#core/env";
import type { AppLogger } from "#core/log/logger";
import type { Redis } from "#core/redis/client";
import type { SystemRole } from "#core/permissions/roles";
import { createUnknownCampaignFactPort } from "#core/app/campaignFactPort";
import { FakeIdentityPort, testIdentityToken } from "#test/helpers/fakeIdentity";
import { createTestEnv } from "#test/helpers/testEnv";

export type TestActor = {
  actorId: string;
  systemRole: SystemRole;
};

export type BuildTestAppOptions = {
  env?: Partial<AppEnv>;
  modules?: readonly AppModule[];
  readyProbe?: () => Promise<{ database: boolean; migrations: boolean }>;
  publicPorts?: AppPublicPorts;
  /**
   * Maps identities to `users` rows like production (creating accounts, status, role); requests
   * then go out with `injectAsIdentity`. Off by default, because most tests act as actors without
   * a user row.
   */
  realAccounts?: boolean;
  /** A logger whose lines the test reads (`captureLogs`); silent otherwise. */
  logger?: AppLogger;
  /** Redis for rate limits and caches (`#test/helpers/testRedis`); per process otherwise. */
  redis?: Redis;
};

export type TestInjectRequest = InjectOptions;

function createDefaultTestPorts(
  identity: FakeIdentityPort,
  actorRoles: Map<string, SystemRole>,
): AppPublicPorts {
  return {
    identityPort: identity,
    // The identity is the actor itself, with the role the test acts in; tests opt into the real
    // mapping with realAccounts.
    accountPort: {
      resolveActor: async ({ externalUserId }) => {
        const systemRole = actorRoles.get(externalUserId);

        return systemRole ? { actorId: externalUserId, systemRole } : null;
      },
    },
    campaignFactPort: {
      ...createUnknownCampaignFactPort(),
      resolveCampaignAccess: async ({ campaignId, actorId }) => ({
        campaignId,
        rulesetId: "ruleset-default",
        campaignMemberId: actorId ? `member-${actorId}` : null,
        membershipActive: Boolean(actorId),
        // The most permissive role, so the use case decides in tests with this fake.
        campaignRole: actorId ? "OWNER" : null,
      }),
    },
  };
}

export function buildTestApp(options: BuildTestAppOptions = {}) {
  const env = createTestEnv(options.env ?? {});
  const identity = new FakeIdentityPort();
  const actorRoles = new Map<string, SystemRole>();
  const publicPorts: AppPublicPorts = {
    ...createDefaultTestPorts(identity, actorRoles),
    ...(options.publicPorts ?? {}),
  };

  if (options.realAccounts) {
    // The auth module then installs the production account service.
    delete publicPorts.accountPort;
  }

  const buildOptions: {
    env: AppEnv;
    modules?: readonly AppModule[];
    readyProbe: () => Promise<{ database: boolean; migrations: boolean }>;
    publicPorts: AppPublicPorts;
    logger?: AppLogger;
    redis: Redis | null;
  } = {
    redis: options.redis ?? null,
    env,
    readyProbe:
      options.readyProbe ??
      (async () => ({
        database: true,
        migrations: true,
      })),
    publicPorts,
  };

  if (options.modules) {
    buildOptions.modules = options.modules;
  }

  if (options.logger) {
    buildOptions.logger = options.logger;
  }

  const app = buildApp(buildOptions);

  /** The authorization header for an actor; also for requests sent outside `inject`. */
  const authorizationFor = (actor: TestActor): string => {
    actorRoles.set(actor.actorId, actor.systemRole);

    return `Bearer ${testIdentityToken(actor.actorId)}`;
  };

  const injectWith = async (
    authorization: string,
    request: TestInjectRequest,
  ): Promise<InjectResponse> => {
    const existingHeaders =
      (request.headers as Record<string, string | string[] | undefined> | undefined) ?? {};

    return app.inject({
      ...request,
      headers: { ...existingHeaders, authorization },
    }) as Promise<InjectResponse>;
  };

  const injectAs = async (actor: TestActor, request: TestInjectRequest) =>
    injectWith(authorizationFor(actor), request);

  /** With `realAccounts`: a request with the session of a provider account. */
  const injectAsIdentity = async (
    externalUserId: string,
    request: TestInjectRequest,
    sessionId?: string,
  ) => injectWith(`Bearer ${testIdentityToken(externalUserId, sessionId)}`, request);

  return {
    app,
    env,
    identity,
    authorizationFor,
    injectAs,
    injectAsIdentity,
  };
}
