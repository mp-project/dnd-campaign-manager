import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { users } from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  admin: "a0000000-0000-4000-8000-000000000004",
  maintainer: "a0000000-0000-4000-8000-000000000006",
  target: "a0000000-0000-4000-8000-000000000002",
  other: "a0000000-0000-4000-8000-000000000003",
} as const;

const ADMIN: TestActor = { actorId: ID.admin, systemRole: "ADMIN" };
const MAINTAINER: TestActor = { actorId: ID.maintainer, systemRole: "SYSTEM_MAINTAINER" };
const TARGET: TestActor = { actorId: ID.target, systemRole: "USER" };
const OTHER: TestActor = { actorId: ID.other, systemRole: "USER" };

type HistoryItem = {
  eventId: string;
  action: string;
  field: string;
  kind: string;
  value: unknown;
  redacted: boolean;
  version: number;
  actorId: string | null;
  isBaseline: boolean;
};

describe("users history", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  beforeEach(async () => {
    await db.insert(users).values([
      { id: ID.admin, systemRole: "ADMIN" as const },
      { id: ID.maintainer, systemRole: "SYSTEM_MAINTAINER" as const },
      { id: ID.target, systemRole: "USER" as const },
      { id: ID.other, systemRole: "USER" as const },
    ].map((user) => ({
      ...user,
      email: `${user.id}@example.test`,
      passwordHash: "secret-hash",
      displayName: "Original Name",
      status: "ACTIVE" as const,
      emailVerifiedAt: new Date(),
    })));
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const url = `/api/v1/users/${ID.target}`;

  const patch = (payload: Record<string, unknown>, actor = ADMIN) =>
    injectAs(actor, { method: "PATCH", url, payload });

  const history = (actor = ADMIN) =>
    injectAs(actor, { method: "GET", url: `/api/v1/history/user/${ID.target}` });

  const entries = async (actor = ADMIN): Promise<HistoryItem[]> => {
    const response = await history(actor);

    expect(response.statusCode).toBe(200);

    return response.json().data;
  };

  const find = async () => {
    const [row] = await db.select().from(users).where(eq(users.id, ID.target));

    return row!;
  };

  it("records who changed which rights, with the old state as first version", async () => {
    expect((await patch({ status: "LOCKED", expectedVersion: 1 })).statusCode).toBe(200);

    const items = await entries();

    expect(items.find((item) => item.version === 2)).toMatchObject({
      action: "user.update",
      field: "status",
      value: "LOCKED",
      actorId: ID.admin,
    });
    expect(
      items.filter((item) => item.isBaseline).map((item) => [item.field, item.value]).sort(),
    ).toEqual([
      ["status", "ACTIVE"],
      ["systemRole", "USER"],
    ]);
  });

  it("records a new role", async () => {
    expect(
      (await patch({ systemRole: "ADMIN", expectedVersion: 1 }, MAINTAINER)).statusCode,
    ).toBe(200);
    expect((await entries()).find((item) => item.version === 2)).toMatchObject({
      field: "systemRole",
      value: "ADMIN",
      actorId: ID.maintainer,
    });
  });

  it("only records that a name changed, not the value", async () => {
    await patch({ displayName: "Secret Identity", expectedVersion: 1 });

    const raw = (await history()).body;
    const change = (JSON.parse(raw).data as HistoryItem[]).find((item) => item.version === 2);

    expect((await find()).displayName).toBe("Secret Identity");
    expect(change).toMatchObject({ field: "displayName", redacted: true, value: null });
    expect(raw).not.toContain("Secret Identity");
    expect(raw).not.toContain("Original Name");
  });

  it("keeps password, email and login data out of the history", async () => {
    await patch({ status: "LOCKED", expectedVersion: 1 });

    const raw = (await history()).body;

    expect(raw).not.toContain("secret-hash");
    expect(raw).not.toContain(`${ID.target}@example.test`);
    expect((JSON.parse(raw).data as HistoryItem[]).map((item) => item.field)).not.toEqual(
      expect.arrayContaining(["passwordHash", "email", "lastLoginAt"]),
    );
  });

  it("records disabling as its own action and keeps the history readable", async () => {
    expect((await injectAs(ADMIN, { method: "DELETE", url })).statusCode).toBe(204);

    expect((await find()).status).toBe("DISABLED");
    expect((await entries()).find((item) => item.version === 2)).toMatchObject({
      action: "user.disable",
      field: "status",
      value: "DISABLED",
      actorId: ID.admin,
    });
  });

  it("does not record changes to the own profile", async () => {
    const response = await injectAs(TARGET, {
      method: "PATCH",
      url: "/api/v1/me",
      payload: { displayName: "Self Service" },
    });

    expect(response.statusCode).toBe(200);
    expect(await entries()).toEqual([]);
  });

  it("rejects an admin change after the user changed the own profile", async () => {
    await injectAs(TARGET, {
      method: "PATCH",
      url: "/api/v1/me",
      payload: { displayName: "Self Service" },
    });

    const stale = await patch({ displayName: "Overwritten", expectedVersion: 1 });

    expect(stale.statusCode).toBe(412);
    expect((await find()).displayName).toBe("Self Service");
  });

  it("never undoes or restores anything, not even for the highest role", async () => {
    await patch({ systemRole: "ADMIN", expectedVersion: 1 }, MAINTAINER);
    await patch({ displayName: "New Name", expectedVersion: 2 }, MAINTAINER);

    const items = await entries(MAINTAINER);
    const roleChange = items.find((item) => item.version === 2)!;
    const nameChange = items.find((item) => item.version === 3)!;
    const undo = (eventId: string) =>
      injectAs(MAINTAINER, {
        method: "POST",
        url: `/api/v1/history/events/${eventId}/revert`,
        payload: {},
      });

    expect((await undo(roleChange.eventId)).statusCode).toBe(409);
    expect((await undo(nameChange.eventId)).statusCode).toBe(409);
    expect(
      (
        await injectAs(MAINTAINER, {
          method: "POST",
          url: `/api/v1/history/user/${ID.target}/versions/1/restore`,
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(await find()).toMatchObject({
      systemRole: "ADMIN",
      displayName: "New Name",
      version: 3,
    });
  });

  it("shows the history only to administrators, not to the user", async () => {
    await patch({ status: "LOCKED", expectedVersion: 1 });

    expect((await history(ADMIN)).statusCode).toBe(200);
    expect((await history(MAINTAINER)).statusCode).toBe(200);
    expect((await history(TARGET)).statusCode).toBe(404);
    expect((await history(OTHER)).statusCode).toBe(404);
  });

  it("writes no entries when a change is refused", async () => {
    expect((await patch({ status: "LOCKED", expectedVersion: 1 }, OTHER)).statusCode).toBe(403);
    expect((await patch({ systemRole: "ADMIN", expectedVersion: 1 })).statusCode).toBe(403);
    expect(await entries()).toEqual([]);
  });
});
