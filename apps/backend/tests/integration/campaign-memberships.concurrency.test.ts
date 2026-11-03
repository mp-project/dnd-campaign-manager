import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { campaignMemberships, campaigns, rulesets, users } from "#core/db/schema";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

const OWNER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PLAYER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RULESET_ID = "11111111-1111-4111-8111-111111111111";
const owner = { actorId: OWNER_ID, systemRole: "USER" } as const;

describe("campaign membership concurrency", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  beforeEach(async () => {
    await db.insert(rulesets).values({
      id: RULESET_ID,
      code: "DND_5E_IT_MEMBERSHIP_LOCKS",
      name: "D&D 5E IT",
      description: null,
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
      attribution: null,
    });

    await db.insert(users).values(
      [OWNER_ID, PLAYER_ID].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "User",
        systemRole: "USER" as const,
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("does not exhaust the connection pool under concurrent member writes", async () => {
    const createResponse = await injectAs(owner, {
      method: "POST",
      url: "/api/v1/campaigns",
      payload: {
        name: "Membership Locks",
        slug: "membership-locks",
        rulesetId: RULESET_ID,
        settings: {},
      },
    });
    const campaignId = createResponse.json().id as string;
    const [membership] = await db
      .insert(campaignMemberships)
      .values({
        campaignId,
        userId: PLAYER_ID,
        role: "PLAYER",
        status: "ACTIVE",
        joinedAt: new Date(),
        createdBy: OWNER_ID,
      })
      .returning();
    const url = `/api/v1/campaigns/${campaignId}/members/${membership!.id}`;

    // Ten writes per route stay within the per-route rate limit and match the pool size.
    const responses = await Promise.all([
      ...Array.from({ length: 10 }, () =>
        injectAs(owner, {
          method: "PATCH",
          url,
          payload: { role: "EDITOR", expectedVersion: 1 },
        }),
      ),
      ...Array.from({ length: 10 }, () => injectAs(owner, { method: "DELETE", url })),
    ]);

    const statusCodes = new Set(responses.map((response) => response.statusCode));

    expect([...statusCodes].every((code) => [200, 204, 404, 412].includes(code))).toBe(true);
  }, 15_000);

  it("answers 503 instead of waiting forever for a locked campaign", async () => {
    const createResponse = await injectAs(
      { actorId: PLAYER_ID, systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "Locked Campaign",
          slug: "locked-campaign",
          rulesetId: RULESET_ID,
          settings: {},
        },
      },
    );
    const campaignId = createResponse.json().id as string;
    const [membership] = await db
      .select()
      .from(campaignMemberships)
      .where(eq(campaignMemberships.campaignId, campaignId));

    const response = await db.transaction(async (tx) => {
      await tx.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.id, campaignId)).for("update");

      return injectAs(
        { actorId: PLAYER_ID, systemRole: "USER" },
        {
          method: "DELETE",
          url: `/api/v1/campaigns/${campaignId}/members/${membership!.id}`,
        },
      );
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "SERVICE_UNAVAILABLE" } });
  }, 15_000);
});
