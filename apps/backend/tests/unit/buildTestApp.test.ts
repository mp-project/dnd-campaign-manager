import { z } from "zod";

import { buildTestApp } from "#test/helpers/buildTestApp";
import type { AppModule } from "#core/app/moduleSystem";

const probeModule: AppModule = {
  name: "probe",
  dependencies: [],
  register: async (app) => {
    app.get(
      "/probe/:campaignId",
      {
        schema: {
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

describe("buildTestApp helper", () => {
  it("injectAs authenticates a test actor and resolves campaign context", async () => {
    const { app, injectAs } = buildTestApp({
      modules: [probeModule],
    });

    const response = await injectAs(
      {
        actorId: "alice",
        systemRole: "USER",
      },
      {
        method: "GET",
        url: "/api/v1/probe/c0000000-0000-4000-8000-000000000001",
      },
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      requestContext: {
        actorId: "alice",
        systemRole: "USER",
      },
      campaignContext: {
        campaignId: "c0000000-0000-4000-8000-000000000001",
        campaignMemberId: "member-alice",
      },
    });

    await app.close();
  });
});
