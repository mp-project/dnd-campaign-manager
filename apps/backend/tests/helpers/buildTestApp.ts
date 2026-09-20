import type { InjectOptions, Response as InjectResponse } from "light-my-request";
import jsonwebtoken, { type SignOptions } from "jsonwebtoken";

import { buildApp } from "#src/app";
import type { AppModule } from "#core/app/moduleSystem";
import type { AppPublicPorts } from "#core/app/container";
import type { AppEnv } from "#core/env";
import type { SystemRole } from "#core/permissions/roles";
import { createUnknownCampaignFactPort } from "#core/app/campaignFactPort";
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
};

export type TestInjectRequest = InjectOptions;

function createActorToken(actor: TestActor, env: AppEnv): string {
  const expiresIn = env.JWT_ACCESS_TTL as NonNullable<SignOptions["expiresIn"]>;

  return jsonwebtoken.sign(
    { systemRole: actor.systemRole },
    env.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      subject: actor.actorId,
      expiresIn,
    },
  );
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
    publicPorts: AppPublicPorts;
  } = {
    env,
    readyProbe:
      options.readyProbe ??
      (async () => ({
        database: true,
        migrations: true,
      })),
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
    const actorToken = createActorToken(actor, env);
    const existingCookieHeader =
      typeof existingHeaders.cookie === "string" ? existingHeaders.cookie : "";
    const authCookie = `access_token=${encodeURIComponent(actorToken)}`;
    const mergedCookieHeader = existingCookieHeader
      ? `${existingCookieHeader}; ${authCookie}`
      : authCookie;

    return app.inject({
      ...request,
      headers: {
        ...existingHeaders,
        authorization: `Bearer ${actorToken}`,
        cookie: mergedCookieHeader,
      },
    }) as Promise<InjectResponse>;
  };

  return {
    app,
    env,
    injectAs,
  };
}
