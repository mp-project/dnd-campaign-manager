import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { rulesets } from "#core/db/schema";
import { buildTestApp } from "#test/helpers/buildTestApp";

function buildLevelProgressions() {
  return Array.from({ length: 20 }, (_, index) => ({
    characterLevel: index + 1,
    proficiencyBonus: Math.floor(index / 4) + 2,
    experienceThreshold: index * 1000,
  }));
}

function buildSpellSlotProgressions() {
  return [
    { casterLevel: 1, slotLevel: 1, slotCount: 2 },
    { casterLevel: 2, slotLevel: 1, slotCount: 3 },
    { casterLevel: 3, slotLevel: 2, slotCount: 2 },
  ];
}

function buildCreatePayload(code: string) {
  return {
    code,
    name: `Ruleset ${code}`,
    description: `Description for ${code}`,
    editionYear: 2024,
    sourceReference: {
      source: "integration-test",
    },
    licenseCode: "TEST_LICENSE",
    attribution: "Integration Test",
    levelProgressions: buildLevelProgressions(),
    spellSlotProgressions: buildSpellSlotProgressions(),
  };
}

describe("ruleset HTTP routes", () => {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

  const pool = createPgPool(testDatabaseUrl);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("returns 401 for unauthenticated list requests", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/ruleset",
    });

    expect(response.statusCode).toBe(401);
  });

  it("creates, reads, updates and soft-deletes a ruleset", async () => {
    const createResponse = await injectAs(
      { actorId: "admin-1", systemRole: "ADMIN" },
      {
        method: "POST",
        url: "/api/v1/ruleset",
        payload: buildCreatePayload("DND_5E_IT_01"),
      },
    );

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json();

    const getResponse = await injectAs(
      { actorId: "user-1", systemRole: "USER" },
      {
        method: "GET",
        url: `/api/v1/ruleset/${created.id}`,
      },
    );

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      id: created.id,
      code: "DND_5E_IT_01",
      status: "ACTIVE",
    });

    const updateResponse = await injectAs(
      { actorId: "admin-1", systemRole: "ADMIN" },
      {
        method: "PATCH",
        url: `/api/v1/ruleset/${created.id}`,
        payload: {
          expectedVersion: created.version,
          name: "Updated Name",
        },
      },
    );

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      name: "Updated Name",
      version: created.version + 1,
    });

    const staleVersionResponse = await injectAs(
      { actorId: "admin-1", systemRole: "ADMIN" },
      {
        method: "PATCH",
        url: `/api/v1/ruleset/${created.id}`,
        payload: {
          expectedVersion: created.version,
          description: "stale update",
        },
      },
    );

    expect(staleVersionResponse.statusCode).toBe(412);

    const deleteResponse = await injectAs(
      { actorId: "admin-1", systemRole: "ADMIN" },
      {
        method: "DELETE",
        url: `/api/v1/ruleset/${created.id}`,
      },
    );

    expect(deleteResponse.statusCode).toBe(204);

    const listActiveResponse = await injectAs(
      { actorId: "user-1", systemRole: "USER" },
      {
        method: "GET",
        url: "/api/v1/ruleset?limit=20",
      },
    );

    expect(listActiveResponse.statusCode).toBe(200);
    expect(
      listActiveResponse
        .json()
        .data.some((item: { id: string }) => item.id === created.id),
    ).toBe(false);

    const listIncludingArchivedResponse = await injectAs(
      { actorId: "user-1", systemRole: "USER" },
      {
        method: "GET",
        url: "/api/v1/ruleset?limit=20&includeArchived=true",
      },
    );

    expect(listIncludingArchivedResponse.statusCode).toBe(200);
    expect(
      listIncludingArchivedResponse
        .json()
        .data.some((item: { id: string }) => item.id === created.id),
    ).toBe(false);

    const validationResponse = await injectAs(
      { actorId: "admin-1", systemRole: "ADMIN" },
      {
        method: "POST",
        url: `/api/v1/ruleset/${created.id}/validate`,
      },
    );

    expect(validationResponse.statusCode).toBe(404);

    const rows = await db
      .select()
      .from(rulesets)
      .where(eq(rulesets.id, created.id));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.deletedAt).not.toBeNull();
  });

  it("rejects invalid DTOs and missing permissions", async () => {
    const invalidPayload = buildCreatePayload("DND_5E_IT_02");
    invalidPayload.levelProgressions = invalidPayload.levelProgressions.slice(0, 19);

    const badDtoResponse = await injectAs(
      { actorId: "admin-2", systemRole: "ADMIN" },
      {
        method: "POST",
        url: "/api/v1/ruleset",
        payload: invalidPayload,
      },
    );

    expect(badDtoResponse.statusCode).toBe(400);

    const forbiddenResponse = await injectAs(
      { actorId: "user-2", systemRole: "USER" },
      {
        method: "POST",
        url: "/api/v1/ruleset",
        payload: buildCreatePayload("DND_5E_IT_03"),
      },
    );

    expect(forbiddenResponse.statusCode).toBe(403);
  });

  it("enforces active code uniqueness", async () => {
    const payload = buildCreatePayload("DND_5E_IT_UNIQUE");

    const first = await injectAs(
      { actorId: "admin-3", systemRole: "ADMIN" },
      {
        method: "POST",
        url: "/api/v1/ruleset",
        payload,
      },
    );

    expect(first.statusCode).toBe(201);

    const second = await injectAs(
      { actorId: "admin-3", systemRole: "ADMIN" },
      {
        method: "POST",
        url: "/api/v1/ruleset",
        payload,
      },
    );

    expect(second.statusCode).toBe(409);
  });
});
