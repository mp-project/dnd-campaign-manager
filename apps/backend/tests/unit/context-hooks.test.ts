import { z } from "zod";

import { buildApp } from "#src/app";
import type { AppModule } from "#core/app/module-system";
import { createTestEnv } from "#test/helpers/test-env";

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

describe("request and campaign context hooks", () => {
  it("derives contexts from verified token and campaign facts instead of client role/ruleset", async () => {
    const app = buildApp({
      env: createTestEnv(),
      modules: [contextProbeModule],
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
      publicPorts: {
        campaignFactPort: {
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

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/context/campaign-1",
      headers: {
        authorization: "Bearer user:alice",
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
    const app = buildApp({
      env: createTestEnv(),
      modules: [contextProbeModule],
      readyProbe: async () => ({ database: true, migrations: true }),
      staticRoot: "/tmp/non-existent-static-root",
      publicPorts: {
        campaignFactPort: {
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

    const response = await app.inject({
      method: "GET",
      url: "/api/v1/context/campaign-2",
      headers: {
        authorization: "Bearer user:player-1",
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
