import { z } from "zod";
import jsonwebtoken from "jsonwebtoken";

import { buildApp } from "#src/app";
import type { AppPublicPorts, SessionStatePort } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { SYSTEM_ROLE } from "#core/permissions/roles";
import { createTestEnv } from "#test/helpers/testEnv";

const contextProbeModule: AppModule = {
  name: "context-probe",
  dependencies: [],
  register: async (app) => {
    app.get(
      "/context/:campaignId",
      {
        config: { public: "test probe" },
        schema: {
          tags: ["Context"],
          operationId: "probeCampaignContext",
          params: z.strictObject({
            campaignId: z.string().min(1),
          }),
        },
      },
      async (request) => ({
        requestContext: request.requestContext,
        campaignContext: request.campaignContext,
      }),
    );
  },
};

async function createAccessToken(
  actorId: string,
  systemRole: (typeof SYSTEM_ROLE)[keyof typeof SYSTEM_ROLE],
  secret: string,
): Promise<string> {
  return jsonwebtoken.sign(
    { systemRole, sv: 3 },
    secret,
    {
      algorithm: "HS256",
      subject: actorId,
      expiresIn: "15m",
    },
  );
}

const trustTokenSessionState: SessionStatePort = {
  resolveActor: async ({ systemRole }) => ({ systemRole }),
};

async function probeRequestContext(publicPorts: AppPublicPorts, token: string) {
  const env = createTestEnv();
  const app = buildApp({
    env,
    modules: [contextProbeModule],
    readyProbe: async () => ({ database: true, migrations: true }),
    publicPorts,
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/context/not-a-uuid",
    headers: { authorization: `Bearer ${token}` },
  });

  await app.close();

  return response.json().requestContext as { actorId: string | null; systemRole: string };
}

describe("session state check of access tokens", () => {
  const env = createTestEnv();

  it("accepts no token at all without a session state port", async () => {
    const token = await createAccessToken("alice", SYSTEM_ROLE.ADMIN, env.JWT_ACCESS_SECRET);

    expect(await probeRequestContext({}, token)).toEqual({ actorId: null, systemRole: "USER" });
  });

  it("drops the token when the port refuses it (locked, outdated session version)", async () => {
    const token = await createAccessToken("alice", SYSTEM_ROLE.ADMIN, env.JWT_ACCESS_SECRET);
    const resolveActor = jest.fn().mockResolvedValue(null);

    expect(await probeRequestContext({ sessionStatePort: { resolveActor } }, token)).toEqual({
      actorId: null,
      systemRole: "USER",
    });
    expect(resolveActor).toHaveBeenCalledWith({
      actorId: "alice",
      systemRole: "ADMIN",
      sessionVersion: 3,
    });
  });

  it("uses the role from the port instead of the token", async () => {
    const token = await createAccessToken("alice", SYSTEM_ROLE.ADMIN, env.JWT_ACCESS_SECRET);
    const sessionStatePort: SessionStatePort = {
      resolveActor: async () => ({ systemRole: SYSTEM_ROLE.USER }),
    };

    expect(await probeRequestContext({ sessionStatePort }, token)).toEqual({
      actorId: "alice",
      systemRole: "USER",
    });
  });

  it("passes a missing session version on as null", async () => {
    const token = jsonwebtoken.sign({ systemRole: "USER" }, env.JWT_ACCESS_SECRET, {
      algorithm: "HS256",
      subject: "alice",
      expiresIn: "15m",
    });
    const resolveActor = jest.fn().mockResolvedValue(null);

    await probeRequestContext({ sessionStatePort: { resolveActor } }, token);

    expect(resolveActor).toHaveBeenCalledWith(expect.objectContaining({ sessionVersion: null }));
  });
});

describe("request and campaign context hooks", () => {
  it("derives contexts from verified token and campaign facts instead of client role/ruleset", async () => {
    const env = createTestEnv();
    const app = buildApp({
      env,
      modules: [contextProbeModule],
      readyProbe: async () => ({ database: true, migrations: true }),
      publicPorts: {
        sessionStatePort: trustTokenSessionState,
        campaignFactPort: {
          hasVisitedLocation: async () => "UNKNOWN",
          hasMetNpc: async () => "UNKNOWN",
          hasResolvedEncounter: async () => "UNKNOWN",
          isQuestCompleted: async () => "UNKNOWN",
          resolveCampaignAccess: async ({ campaignId, actorId }) => ({
            campaignId,
            rulesetId: "ruleset-from-campaign",
            campaignMemberId: actorId ? `member-${actorId}` : null,
            membershipActive: true,
          }),
        },
      },
    });

    const accessToken = await createAccessToken(
      "alice",
      SYSTEM_ROLE.USER,
      env.JWT_ACCESS_SECRET,
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/context/c0000000-0000-4000-8000-000000000001",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-campaign-role": "PLAYER",
        "x-ruleset-id": "forged-ruleset",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestContext: {
        actorId: "alice",
        systemRole: "USER",
      },
      campaignContext: {
        campaignId: "c0000000-0000-4000-8000-000000000001",
        rulesetId: "ruleset-from-campaign",
        campaignMemberId: "member-alice",
      },
    });

    await app.close();
  });

  it("sets null campaign role and no permissions for inactive membership", async () => {
    const env = createTestEnv();
    const app = buildApp({
      env,
      modules: [contextProbeModule],
      readyProbe: async () => ({ database: true, migrations: true }),
      publicPorts: {
        sessionStatePort: trustTokenSessionState,
        campaignFactPort: {
          hasVisitedLocation: async () => "UNKNOWN",
          hasMetNpc: async () => "UNKNOWN",
          hasResolvedEncounter: async () => "UNKNOWN",
          isQuestCompleted: async () => "UNKNOWN",
          resolveCampaignAccess: async ({ campaignId }) => ({
            campaignId,
            rulesetId: "ruleset-x",
            campaignMemberId: "member-player-1",
            membershipActive: false,
          }),
        },
      },
    });

    const accessToken = await createAccessToken(
      "player-1",
      SYSTEM_ROLE.USER,
      env.JWT_ACCESS_SECRET,
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/context/c0000000-0000-4000-8000-000000000002",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      campaignContext: {
        campaignMemberId: null,
        permissions: [],
      },
    });

    await app.close();
  });

  it("ignores malformed campaign ids instead of resolving them", async () => {
    const env = createTestEnv();
    const resolveCampaignAccess = jest.fn();
    const app = buildApp({
      env,
      modules: [contextProbeModule],
      readyProbe: async () => ({ database: true, migrations: true }),
      publicPorts: {
        sessionStatePort: trustTokenSessionState,
        campaignFactPort: {
          hasVisitedLocation: async () => "UNKNOWN",
          hasMetNpc: async () => "UNKNOWN",
          hasResolvedEncounter: async () => "UNKNOWN",
          isQuestCompleted: async () => "UNKNOWN",
          resolveCampaignAccess,
        },
      },
    });

    const accessToken = await createAccessToken("alice", SYSTEM_ROLE.USER, env.JWT_ACCESS_SECRET);

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/context/not-a-uuid",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-campaign-id": "also-not-a-uuid",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ campaignContext: null });
    expect(resolveCampaignAccess).not.toHaveBeenCalled();

    await app.close();
  });
});
