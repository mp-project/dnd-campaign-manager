import { z } from "zod";

import { buildApp } from "#src/app";
import type { AppPublicPorts } from "#core/app/container";
import type { AccountPort } from "#core/auth/identity";
import type { AppModule } from "#core/app/moduleSystem";
import { SYSTEM_ROLE, type SystemRole } from "#core/permissions/roles";
import { FakeIdentityPort, testIdentityToken } from "#test/helpers/fakeIdentity";
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

/** Every identity is the actor of the same name, with the role the test names. */
function trustingAccounts(systemRole: SystemRole = SYSTEM_ROLE.USER): AccountPort {
  return { resolveActor: async ({ externalUserId }) => ({ actorId: externalUserId, systemRole }) };
}

async function probeRequestContext(publicPorts: AppPublicPorts, authorization: string) {
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
    headers: { authorization },
  });

  await app.close();

  return response.json().requestContext as { actorId: string | null; systemRole: string };
}

describe("identity check of requests", () => {
  const identity = new FakeIdentityPort();
  const bearer = (user: string) => `Bearer ${testIdentityToken(user, "sess_1")}`;

  it("signs nobody in without identity and account ports", async () => {
    expect(await probeRequestContext({}, bearer("alice"))).toEqual({
      actorId: null,
      systemRole: "USER",
    });
    expect(
      await probeRequestContext({ identityPort: identity }, bearer("alice")),
    ).toEqual({ actorId: null, systemRole: "USER" });
  });

  it("ignores a token the identity provider doesn't confirm", async () => {
    const resolveActor = jest.fn();

    expect(
      await probeRequestContext({ identityPort: identity, accountPort: { resolveActor } }, "Bearer forged"),
    ).toEqual({ actorId: null, systemRole: "USER" });
    expect(resolveActor).not.toHaveBeenCalled();
  });

  it("hands the confirmed identity to the account port, which may refuse it (locked)", async () => {
    const resolveActor = jest.fn().mockResolvedValue(null);

    expect(
      await probeRequestContext({ identityPort: identity, accountPort: { resolveActor } }, bearer("alice")),
    ).toEqual({ actorId: null, systemRole: "USER" });
    expect(resolveActor).toHaveBeenCalledWith({ externalUserId: "alice", sessionId: "sess_1", expiresAt: null });
  });

  it("uses the local account and its role", async () => {
    const accountPort: AccountPort = {
      resolveActor: async () => ({ actorId: "local-alice", systemRole: SYSTEM_ROLE.ADMIN }),
    };

    expect(await probeRequestContext({ identityPort: identity, accountPort }, bearer("alice"))).toEqual({
      actorId: "local-alice",
      systemRole: "ADMIN",
    });
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
        identityPort: new FakeIdentityPort(),
        accountPort: trustingAccounts(),
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
            campaignRole: "PLAYER",
          }),
        },
      },
    });

    const accessToken = testIdentityToken("alice");

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
        identityPort: new FakeIdentityPort(),
        accountPort: trustingAccounts(),
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
            campaignRole: "PLAYER",
          }),
        },
      },
    });

    const accessToken = testIdentityToken("player-1");

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
        identityPort: new FakeIdentityPort(),
        accountPort: trustingAccounts(),
        campaignFactPort: {
          hasVisitedLocation: async () => "UNKNOWN",
          hasMetNpc: async () => "UNKNOWN",
          hasResolvedEncounter: async () => "UNKNOWN",
          isQuestCompleted: async () => "UNKNOWN",
          resolveCampaignAccess,
        },
      },
    });

    const accessToken = testIdentityToken("alice");

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
