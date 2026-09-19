import { z } from "zod";
import jsonwebtoken from "jsonwebtoken";

import { buildApp } from "#src/app";
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
    { systemRole },
    secret,
    {
      algorithm: "HS256",
      subject: actorId,
      expiresIn: "15m",
    },
  );
}

describe("request and campaign context hooks", () => {
  it("derives contexts from verified token and campaign facts instead of client role/ruleset", async () => {
    const env = createTestEnv();
    const app = buildApp({
      env,
      modules: [contextProbeModule],
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
      publicPorts: {
        campaignFactPort: {
          hasVisitedLocation: async () => "UNKNOWN",
          hasMetNpc: async () => "UNKNOWN",
          hasResolvedEncounter: async () => "UNKNOWN",
          isQuestCompleted: async () => "UNKNOWN",
          resolveCampaignAccess: async ({ campaignId, actorId }) => ({
            campaignId,
            rulesetId: "ruleset-from-campaign",
            campaignMemberId: actorId ? `member-${actorId}` : null,
            campaignRole: "EDITOR",
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
      url: "/api/v1/context/campaign-1",
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
        campaignId: "campaign-1",
        rulesetId: "ruleset-from-campaign",
        campaignRole: "EDITOR",
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
      staticRoot: "/tmp/non-existent-static-root",
      publicPorts: {
        campaignFactPort: {
          hasVisitedLocation: async () => "UNKNOWN",
          hasMetNpc: async () => "UNKNOWN",
          hasResolvedEncounter: async () => "UNKNOWN",
          isQuestCompleted: async () => "UNKNOWN",
          resolveCampaignAccess: async ({ campaignId }) => ({
            campaignId,
            rulesetId: "ruleset-x",
            campaignMemberId: "member-player-1",
            campaignRole: "PLAYER",
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
      url: "/api/v1/context/campaign-2",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      campaignContext: {
        campaignMemberId: null,
        campaignRole: null,
        permissions: [],
      },
    });

    await app.close();
  });
});
