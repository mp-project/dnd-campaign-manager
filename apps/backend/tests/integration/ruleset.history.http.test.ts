import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { rulesets, users } from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ADMIN_ID = "a0000000-0000-4000-8000-000000000004";
const USER_ID = "a0000000-0000-4000-8000-000000000002";
const ADMIN: TestActor = { actorId: ADMIN_ID, systemRole: "ADMIN" };
const USER: TestActor = { actorId: USER_ID, systemRole: "USER" };

type HistoryItem = {
  eventId: string;
  action: string;
  field: string;
  value: unknown;
  version: number;
  actorId: string | null;
  isBaseline: boolean;
  revertsEventId: string | null;
  restoredFromVersion: number | null;
};

describe("ruleset history", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  beforeEach(async () => {
    await db.insert(users).values(
      [ADMIN_ID, USER_ID].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "User",
        systemRole: id === ADMIN_ID ? ("ADMIN" as const) : ("USER" as const),
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const create = async (code = "HISTORY_TEST") => {
    const response = await injectAs(ADMIN, {
      method: "POST",
      url: "/api/v1/ruleset",
      payload: {
        code,
        name: "Original",
        description: "First text",
        editionYear: 2024,
        sourceReference: { source: "test" },
        licenseCode: "TEST",
        attribution: "Author",
        levelProgressions: Array.from({ length: 20 }, (_, index) => ({
          characterLevel: index + 1,
          proficiencyBonus: 2,
          experienceThreshold: index * 1000,
        })),
        spellSlotProgressions: [{ casterLevel: 1, slotLevel: 1, slotCount: 2 }],
      },
    });

    expect(response.statusCode).toBe(201);

    return response.json() as { id: string; version: number };
  };

  const patch = (id: string, payload: Record<string, unknown>, actor = ADMIN) =>
    injectAs(actor, { method: "PATCH", url: `/api/v1/ruleset/${id}`, payload });

  const history = (id: string, actor = ADMIN) =>
    injectAs(actor, { method: "GET", url: `/api/v1/history/ruleset/${id}` });

  const entries = async (id: string): Promise<HistoryItem[]> => {
    const response = await history(id);

    expect(response.statusCode).toBe(200);

    return response.json().data;
  };

  const revert = (eventId: string, actor = ADMIN) =>
    injectAs(actor, {
      method: "POST",
      url: `/api/v1/history/events/${eventId}/revert`,
      payload: {},
    });

  const restore = (id: string, version: number, actor = ADMIN) =>
    injectAs(actor, {
      method: "POST",
      url: `/api/v1/history/ruleset/${id}/versions/${version}/restore`,
      payload: {},
    });

  const find = async (id: string) => {
    const [row] = await db.select().from(rulesets).where(eq(rulesets.id, id));

    return row!;
  };

  it("records a new ruleset and leaves the fixed fields and tables out", async () => {
    const { id } = await create();
    const items = await entries(id);

    expect(items.map((item) => item.field).sort()).toEqual([
      "attribution",
      "description",
      "name",
      "sourceReference",
      "status",
    ]);
    expect(items.every((item) => item.action === "ruleset.create" && item.isBaseline)).toBe(true);
    expect(items.every((item) => item.actorId === ADMIN_ID)).toBe(true);
  });

  it("creates the progressions together with the ruleset", async () => {
    const { id } = await create();
    const response = await injectAs(ADMIN, { method: "GET", url: `/api/v1/ruleset/${id}` });

    expect(response.json().levelProgressions).toHaveLength(20);
    expect(response.json().spellSlotProgressions).toEqual([
      { casterLevel: 1, slotLevel: 1, slotCount: 2 },
    ]);
  });

  it("records changes and undoes them as a new entry", async () => {
    const { id } = await create();

    expect((await patch(id, { name: "Renamed", expectedVersion: 1 })).statusCode).toBe(200);

    const change = (await entries(id)).find((item) => item.version === 2)!;

    expect(change).toMatchObject({ action: "ruleset.update", field: "name", value: "Renamed" });
    expect((await revert(change.eventId)).statusCode).toBe(200);
    expect(await find(id)).toMatchObject({ name: "Original", version: 3 });
    expect((await entries(id)).find((item) => item.version === 3)).toMatchObject({
      revertsEventId: change.eventId,
      value: "Original",
    });
  });

  it("merges stale forms per field and rejects a stale change of the same field", async () => {
    const { id } = await create();

    await patch(id, { name: "Renamed", expectedVersion: 1 });

    const merged = await patch(id, { description: "Second text", name: "Original", expectedVersion: 1 });

    expect(merged.statusCode).toBe(200);
    expect(merged.json()).toMatchObject({
      name: "Renamed",
      description: "Second text",
      merged: ["name"],
    });
    expect((await patch(id, { name: "Stale", expectedVersion: 1 })).statusCode).toBe(412);
  });

  it("restores an old version and brings an archived ruleset back", async () => {
    const { id } = await create();

    await patch(id, { name: "Renamed", status: "ARCHIVED", expectedVersion: 1 });

    expect((await restore(id, 1)).statusCode).toBe(200);
    expect(await find(id)).toMatchObject({ name: "Original", status: "ACTIVE", version: 3 });
    expect((await entries(id)).find((item) => item.version === 3)).toMatchObject({
      restoredFromVersion: 1,
    });
  });

  it("answers 409 when bringing back a ruleset whose code is taken by now", async () => {
    const { id } = await create();

    await patch(id, { status: "ARCHIVED", expectedVersion: 1 });

    const archived = (await entries(id)).find((item) => item.version === 2)!;

    await create();

    expect((await revert(archived.eventId)).statusCode).toBe(409);
    expect((await find(id)).status).toBe("ARCHIVED");
  });

  it("hides the history of a deleted ruleset and never brings it back", async () => {
    const { id } = await create();
    const change = (await entries(id))[0]!;

    expect((await injectAs(ADMIN, { method: "DELETE", url: `/api/v1/ruleset/${id}` })).statusCode).toBe(204);
    expect((await find(id)).deletedAt).not.toBeNull();
    expect((await history(id)).statusCode).toBe(404);
    expect((await restore(id, 1)).statusCode).toBe(404);
    expect((await revert(change.eventId)).statusCode).toBe(404);
  });

  it("answers 404 with the ruleset message for an unknown id", async () => {
    const response = await patch("b0000000-0000-4000-8000-000000000001", {
      name: "Nope",
      expectedVersion: 1,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.message).toBe("Ruleset not found");
  });

  it("shows the history only to administrators", async () => {
    const { id } = await create();
    const change = (await entries(id))[0]!;

    expect((await history(id, USER)).statusCode).toBe(404);
    expect((await revert(change.eventId, USER)).statusCode).toBe(404);
    expect((await restore(id, 1, USER)).statusCode).toBe(404);
  });

  it("writes no entries when a user tries to change a ruleset", async () => {
    const { id } = await create();
    const before = await entries(id);

    expect((await patch(id, { name: "Hacked", expectedVersion: 1 }, USER)).statusCode).toBe(403);
    expect(await entries(id)).toEqual(before);
  });
});
