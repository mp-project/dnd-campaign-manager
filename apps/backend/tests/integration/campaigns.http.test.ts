import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { campaigns, campaignTimeEvents, rulesets, users } from "#core/db/schema";
import { buildTestApp } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

describe("campaigns HTTP routes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  beforeEach(async () => {
    await db.insert(rulesets).values({
      id: "11111111-1111-4111-8111-111111111111",
      code: "DND_5E_IT_CAMPAIGNS",
      name: "D&D 5E IT",
      description: null,
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
      attribution: null,
    });

    await db.insert(users).values({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      email: "owner@example.test",
      passwordHash: "hash",
      displayName: "Owner",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });

    await db.insert(users).values({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      email: "other@example.test",
      passwordHash: "hash",
      displayName: "Other",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });

    await db.insert(users).values({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      email: "admin@example.test",
      passwordHash: "hash",
      displayName: "Admin",
      systemRole: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("creates, lists, updates, archives and returns history", async () => {
    const createResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "The Northern Reach",
          slug: "the-northern-reach",
          description: "Icewind and intrigue",
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {
            visibility: "private",
          },
        },
      },
    );

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();
    expect(created).toMatchObject({
      name: "The Northern Reach",
      slug: "the-northern-reach",
      status: "DRAFT",
    });

    const listResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "GET",
        url: "/api/v1/campaigns?limit=20",
      },
    );

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.some((item: { id: string }) => item.id === created.id)).toBe(
      true,
    );

    const getResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "GET",
        url: `/api/v1/campaigns/${created.id}`,
      },
    );

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().id).toBe(created.id);

    const updateResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "PATCH",
        url: `/api/v1/campaigns/${created.id}`,
        payload: {
          expectedVersion: created.version,
          name: "The Northern Reach Revised",
        },
      },
    );

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      name: "The Northern Reach Revised",
      version: created.version + 1,
    });

    const advanceResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: `/api/v1/campaigns/${created.id}/time/advance`,
        payload: {
          days: 3,
          longRests: 1,
          reason: "Downtime between arcs",
        },
      },
    );

    expect(advanceResponse.statusCode).toBe(200);
    expect(advanceResponse.json()).toMatchObject({
      currentGameDay: 3,
      longRestCount: 1,
    });

    const correctResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: `/api/v1/campaigns/${created.id}/time/correct`,
        payload: {
          gameDay: 4,
          longRestCount: 1,
          reason: "Session log correction",
        },
      },
    );

    expect(correctResponse.statusCode).toBe(200);
    expect(correctResponse.json()).toMatchObject({
      currentGameDay: 4,
      longRestCount: 1,
    });

    const historyResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "GET",
        url: `/api/v1/campaigns/${created.id}/time/history?limit=20`,
      },
    );

    expect(historyResponse.statusCode).toBe(200);
    expect(historyResponse.json().data.length).toBeGreaterThanOrEqual(2);

    const staleUpdateResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "PATCH",
        url: `/api/v1/campaigns/${created.id}`,
        payload: {
          expectedVersion: created.version,
          description: "stale",
        },
      },
    );

    expect(staleUpdateResponse.statusCode).toBe(412);

    const archiveResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "DELETE",
        url: `/api/v1/campaigns/${created.id}`,
      },
    );

    expect(archiveResponse.statusCode).toBe(204);

    const mutateArchivedResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: `/api/v1/campaigns/${created.id}/time/advance`,
        payload: {
          days: 1,
          longRests: 0,
        },
      },
    );

    expect(mutateArchivedResponse.statusCode).toBe(409);

    const campaignRows = await db.select().from(campaigns);
    expect(campaignRows).toHaveLength(1);
    expect(campaignRows[0]?.status).toBe("ARCHIVED");

    const eventRows = await db.select().from(campaignTimeEvents);
    expect(eventRows.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid DTOs and blocks foreign campaign reads", async () => {
    const createResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "A",
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {},
        },
      },
    );

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const immutableRulesetUpdate = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "PATCH",
        url: `/api/v1/campaigns/${created.id}`,
        payload: {
          expectedVersion: created.version,
          rulesetId: "22222222-2222-4222-8222-222222222222",
        },
      },
    );

    expect(immutableRulesetUpdate.statusCode).toBe(400);

    const invalidAdvance = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: `/api/v1/campaigns/${created.id}/time/advance`,
        payload: {
          days: 0,
          longRests: 0,
        },
      },
    );

    expect(invalidAdvance.statusCode).toBe(400);

    const foreignGet = await injectAs(
      { actorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", systemRole: "USER" },
      {
        method: "GET",
        url: `/api/v1/campaigns/${created.id}`,
      },
    );

    expect(foreignGet.statusCode).toBe(404);

    const foreignList = await injectAs(
      { actorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", systemRole: "USER" },
      {
        method: "GET",
        url: "/api/v1/campaigns?limit=20&userId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    );

    expect(foreignList.statusCode).toBe(404);
  });

  it("enforces owner-local slug uniqueness with conflict response", async () => {
    const first = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "Primary",
          slug: "duplicate-slug",
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {},
        },
      },
    );

    expect(first.statusCode).toBe(201);

    const duplicate = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "Secondary",
          slug: "duplicate-slug",
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {},
        },
      },
    );

    expect(duplicate.statusCode).toBe(409);
  });

  it("allows admins to create campaigns for another user and denies cross-owner create for normal users", async () => {
    const deniedUserCreate = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "Foreign Owner Attempt",
          slug: "foreign-owner-attempt",
          ownerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {},
        },
      },
    );

    expect(deniedUserCreate.statusCode).toBe(401);

    const adminCreate = await injectAs(
      { actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", systemRole: "ADMIN" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "Admin Created For User",
          slug: "admin-created-for-user",
          ownerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {},
        },
      },
    );

    expect(adminCreate.statusCode).toBe(201);
    expect(adminCreate.json()).toMatchObject({
      ownerUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      createdBy: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
  });

  it("allows admins to list and read foreign campaigns", async () => {
    const createResponse = await injectAs(
      { actorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: {
          name: "Admin Scope Campaign",
          slug: "admin-scope-campaign",
          rulesetId: "11111111-1111-4111-8111-111111111111",
          settings: {},
        },
      },
    );

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const listResponse = await injectAs(
      { actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", systemRole: "ADMIN" },
      {
        method: "GET",
        url: "/api/v1/campaigns?limit=20&userId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    );

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().data.some((item: { id: string }) => item.id === created.id)).toBe(
      true,
    );

    const getResponse = await injectAs(
      { actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", systemRole: "ADMIN" },
      {
        method: "GET",
        url: `/api/v1/campaigns/${created.id}`,
      },
    );

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().id).toBe(created.id);
  });

  it("returns not found when list userId does not exist", async () => {
    const response = await injectAs(
      { actorId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", systemRole: "ADMIN" },
      {
        method: "GET",
        url: "/api/v1/campaigns?limit=20&userId=ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
    );

    expect(response.statusCode).toBe(404);
  });
});
