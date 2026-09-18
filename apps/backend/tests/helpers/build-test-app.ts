import type { InjectOptions, Response as InjectResponse } from "light-my-request";

import { buildApp } from "#src/app";
import type { AppModule } from "#core/app/module-system";
import type { AppPublicPorts } from "#core/app/container";
import type { AppEnv } from "#core/env";
import { createUnknownCampaignFactPort } from "#core/contracts";
import { createTestEnv } from "#test/helpers/test-env";

export type TestActor = {
  actorId: string;
  systemRole: "ADMIN" | "USER";
};

export type BuildTestAppOptions = {
  env?: Partial<AppEnv>;
  modules?: readonly AppModule[];
  readyProbe?: () => Promise<{ database: boolean; migrations: boolean }>;
  staticRoot?: string;
  publicPorts?: AppPublicPorts;
};

export type TestInjectRequest = InjectOptions;

function createActorToken(actor: TestActor): string {
  if (actor.systemRole === "ADMIN") {
    return `admin:${actor.actorId}`;
  }

  return `user:${actor.actorId}`;
}

function createDefaultTestPorts(): AppPublicPorts {
  return {
    campaignFactPort: {
      ...createUnknownCampaignFactPort(),
      resolveCampaignAccess: async ({ campaignId, actorId }) => ({
        campaignId,
        rulesetId: "ruleset-default",
        campaignMemberId: actorId ? `member-${actorId}` : null,
        campaignRole: actorId ? "EDITOR" : null,
        membershipActive: Boolean(actorId),
      }),
    },
  };
}

export function buildTestApp(options: BuildTestAppOptions = {}) {
  const env = createTestEnv(options.env ?? {});
  const buildOptions: {
    env: AppEnv;
    modules?: readonly AppModule[];
    readyProbe: () => Promise<{ database: boolean; migrations: boolean }>;
    staticRoot: string;
    publicPorts: AppPublicPorts;
  } = {
    env,
    readyProbe:
      options.readyProbe ??
      (async () => ({
        database: true,
        migrations: true,
      })),
    staticRoot: options.staticRoot ?? "/tmp/non-existent-static-root",
    publicPorts: {
      ...createDefaultTestPorts(),
      ...(options.publicPorts ?? {}),
    },
  };

  if (options.modules) {
    buildOptions.modules = options.modules;
  }

  const app = buildApp(buildOptions);

  const injectAs = async (
    actor: TestActor,
    request: TestInjectRequest,
  ): Promise<InjectResponse> => {
    const existingHeaders =
      (request.headers as Record<string, string | string[] | undefined> | undefined) ?? {};

    return app.inject({
      ...request,
      headers: {
        ...existingHeaders,
        authorization: `Bearer ${createActorToken(actor)}`,
      },
    }) as Promise<InjectResponse>;
  };

  return {
    app,
    env,
    injectAs,
  };
}
