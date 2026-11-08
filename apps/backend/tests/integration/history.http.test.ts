import { and, asc, desc, eq } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { AppModule } from "#core/app/moduleSystem";
import { campaignMemberships, campaigns, entityChangeEvents, entityChangeFields, entityHistoryHorizons, historyIdempotencyKeys, rulesets, users } from "#core/db/schema";
import { createDrizzleDb, createPgPool, type AppDatabase } from "#core/db/pool";
import { baseColumns } from "#core/db/schemaHelpers";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, VersionConflictError } from "#core/error/http/index";
import { authorized } from "#core/history/authorization";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import type { CampaignRole } from "#core/http/requestContext";
import { MutationUseCase } from "#core/history/MutationUseCase";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { ActionScope, HistoryEvent, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { defaultAppModules } from "#src/modules/index";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000000001",
  gm: "a0000000-0000-4000-8000-000000000001",
  editor: "a0000000-0000-4000-8000-000000000002",
  player: "a0000000-0000-4000-8000-000000000003",
  otherPlayer: "a0000000-0000-4000-8000-000000000004",
  outsider: "a0000000-0000-4000-8000-000000000005",
  removed: "a0000000-0000-4000-8000-000000000006",
  admin: "a0000000-0000-4000-8000-000000000007",
  campaignA: "c0000000-0000-4000-8000-00000000000a",
  campaignB: "c0000000-0000-4000-8000-00000000000b",
} as const;

const actor = (actorId: string, systemRole: TestActor["systemRole"] = "USER"): TestActor => ({
  actorId,
  systemRole,
});

const GM = actor(ID.gm);
const EDITOR = actor(ID.editor);
const PLAYER = actor(ID.player);
const OTHER_PLAYER = actor(ID.otherPlayer);
const OUTSIDER = actor(ID.outsider);
const REMOVED = actor(ID.removed);
const ADMIN = actor(ID.admin, "ADMIN");

const items = pgTable("history_test_items", {
  ...baseColumns(),
  campaignId: uuid("campaign_id").notNull(),
  ownerId: uuid("owner_id"),
  shared: boolean("shared").notNull().default(true),
  name: text("name").notNull(),
  description: text("description"),
  hp: integer("hp").notNull().default(10),
  maxHp: integer("max_hp").notNull().default(20),
  busy: integer("busy").notNull().default(0),
  sortOrder: text("sort_order"),
  gmNotes: text("gm_notes"),
  code: text("code"),
  email: text("email"),
  role: text("role"),
  policy: text("policy"),
  scope: text("scope"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

const children = pgTable("history_test_children", {
  ...baseColumns(),
  campaignId: uuid("campaign_id").notNull(),
  parentId: uuid("parent_id").notNull(),
  shared: boolean("shared").notNull().default(true),
  title: text("title").notNull(),
});

async function resolveRole(
  campaignId: string,
  actorId: string,
  db: AppDatabase,
): Promise<CampaignRole | null> {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId));

  if (!campaign) {
    return null;
  }

  if (campaign.ownerUserId === actorId) {
    return "OWNER";
  }

  const [membership] = await db
    .select()
    .from(campaignMemberships)
    .where(
      and(
        eq(campaignMemberships.campaignId, campaignId),
        eq(campaignMemberships.userId, actorId),
        eq(campaignMemberships.status, "ACTIVE"),
      ),
    );

  return membership?.role ?? null;
}

const itemAccess = campaignHistoryAccess<typeof items.$inferSelect>({
  campaignId: (row) => row.campaignId,
  resolveRole,
  ownedByPlayer: (row, actorId) => row.ownerId === actorId,
  hiddenFromPlayers: ["gmNotes"],
});

const trackedItem = defineTrackedEntity({
  type: "item",
  table: items,
  access: itemAccess,
  history: { limit: "low" },
  campaignId: (row) => row.campaignId,
  baseSchema: z.object({ name: z.string().min(3) }),
  groups: [["policy", "scope"]],
  validate: (next) => {
    if (next.hp > next.maxHp) {
      throw new ConflictError("hp cannot exceed maxHp");
    }
  },
  fields: {
    campaignId: field.ignore(),
    ownerId: field.ignore(),
    shared: field.ignore(),
    lastSeenAt: field.ignore(),
    name: field.value(),
    description: field.value({ history: "high" }),
    hp: field.counter<typeof items.$inferSelect>({ min: 0, max: (row) => row.maxHp }),
    maxHp: field.value(),
    busy: field.counter({ history: "minimal" }),
    sortOrder: field.position(),
    gmNotes: field.value(),
    code: field.secret(),
    email: field.account(),
    role: field.value({ revertible: false }),
    policy: field.value(),
    scope: field.value(),
  },
});

const childAccess = campaignHistoryAccess<typeof children.$inferSelect>({
  campaignId: (row) => row.campaignId,
  resolveRole,
  ownedByPlayer: (row) => row.shared,
});

const trackedChild = defineTrackedEntity({
  type: "child",
  table: children,
  access: childAccess,
  campaignId: (row) => row.campaignId,
  root: (row) => ({ type: "item", id: row.parentId }),
  fields: {
    campaignId: field.ignore(),
    parentId: field.ignore(),
    shared: field.ignore(),
    title: field.value(),
  },
});

/** Only reading is defined, so nobody but admins may undo anything. */
const trackedReadOnly = defineTrackedEntity({
  type: "readonly",
  table: children,
  access: { read: childAccess.read },
  campaignId: (row) => row.campaignId,
  fields: {
    campaignId: field.ignore(),
    parentId: field.ignore(),
    shared: field.ignore(),
    title: field.value(),
  },
});

let history: HistoryPort;

const allow = async () => authorized();

const testEntitiesModule: AppModule = {
  name: "test-history-entities",
  dependencies: ["history"],
  register: (_app, container) => {
    history = container.ports.history as HistoryPort;
    history.register(trackedItem);
    history.register(trackedChild);
    history.register(trackedReadOnly);
  },
};

const CREATE_TEST_TABLES = `
  CREATE TABLE history_test_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    created_by uuid NOT NULL,
    updated_by uuid,
    campaign_id uuid NOT NULL,
    owner_id uuid,
    shared boolean NOT NULL DEFAULT true,
    name text NOT NULL,
    description text,
    hp integer NOT NULL DEFAULT 10,
    max_hp integer NOT NULL DEFAULT 20,
    busy integer NOT NULL DEFAULT 0,
    sort_order text,
    gm_notes text,
    code text,
    email text,
    role text,
    policy text,
    scope text,
    last_seen_at timestamptz
  );
  CREATE TABLE history_test_children (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    created_by uuid NOT NULL,
    updated_by uuid,
    campaign_id uuid NOT NULL,
    parent_id uuid NOT NULL,
    shared boolean NOT NULL DEFAULT true,
    title text NOT NULL
  );
`;

describe("history module", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp({ modules: [...defaultAppModules, testEntitiesModule] });

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(CREATE_TEST_TABLES);

    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "DND_5E_IT_HISTORY",
      name: "D&D",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });

    await db.insert(users).values(
      Object.entries({
        gm: ID.gm,
        editor: ID.editor,
        player: ID.player,
        otherPlayer: ID.otherPlayer,
        outsider: ID.outsider,
        removed: ID.removed,
        admin: ID.admin,
      }).map(([name, id]) => ({
        id,
        email: `${name}@example.test`,
        passwordHash: "hash",
        displayName: name,
        systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );

    await db.insert(campaigns).values([
      { id: ID.campaignA, ownerUserId: ID.gm, rulesetId: ID.ruleset, name: "A", slug: "a", status: "ACTIVE", createdBy: ID.gm },
      { id: ID.campaignB, ownerUserId: ID.outsider, rulesetId: ID.ruleset, name: "B", slug: "b", status: "ACTIVE", createdBy: ID.outsider },
    ]);

    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaignA, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaignA, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.campaignA, userId: ID.otherPlayer, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.campaignA, userId: ID.removed, role: "EDITOR", status: "REVOKED", revokedAt: new Date(), revokedBy: ID.gm, createdBy: ID.gm },
      { campaignId: ID.campaignB, userId: ID.outsider, role: "EDITOR", createdBy: ID.outsider },
    ]);
  });

  async function createItem(values: Partial<typeof items.$inferInsert> = {}, by: TestActor = GM) {
    return history.runAction({ action: "item.create", context: by, authorize: allow }, (scope) =>
      scope.create(trackedItem, { campaignId: ID.campaignA, name: "Goblin", ...values }),
    );
  }

  async function updateItem(
    id: string,
    input: {
      set?: Record<string, unknown>;
      inc?: Record<string, number>;
      baseVersion?: number;
    },
    by: TestActor = GM,
    action = "item.update",
  ) {
    return history.runAction({ action, context: by, authorize: allow }, (scope) =>
      scope.change(trackedItem, id, () => input),
    );
  }

  async function latestEvent(entityId: string) {
    const [event] = await db
      .select()
      .from(entityChangeEvents)
      .where(eq(entityChangeEvents.entityId, entityId))
      .orderBy(desc(entityChangeEvents.entityVersion))
      .limit(1);

    return event as typeof entityChangeEvents.$inferSelect;
  }

  async function fieldRows(entityId: string, name?: string) {
    return db
      .select()
      .from(entityChangeFields)
      .where(
        and(
          eq(entityChangeFields.entityId, entityId),
          name ? eq(entityChangeFields.field, name) : undefined,
        ),
      )
      .orderBy(asc(entityChangeFields.entityVersion));
  }

  async function currentItem(id: string) {
    const [row] = await db.select().from(items).where(eq(items.id, id));

    return row as typeof items.$inferSelect;
  }

  const post = (by: TestActor, url: string, payload: object = {}) =>
    injectAs(by, { method: "POST", url: `/api/v1${url}`, payload });
  const get = (by: TestActor, url: string, headers: Record<string, string> = {}) =>
    injectAs(by, { method: "GET", url: `/api/v1${url}`, headers });

  async function catchError(work: Promise<unknown>): Promise<VersionConflictError> {
    try {
      await work;
    } catch (error) {
      return error as VersionConflictError;
    }

    throw new Error("Expected the call to fail");
  }

  describe("content", () => {
    it("stores a first version without secrets and ignored columns", async () => {
      const item = await createItem({ code: "s3cret", email: "a@b.test", description: "Text" });
      const rows = await fieldRows(item.id);

      expect(rows.every((row) => row.isBaseline && row.entityVersion === 1)).toBe(true);
      expect(rows.map((row) => row.field)).toEqual(
        expect.arrayContaining(["name", "description", "hp"]),
      );
      expect(rows.map((row) => row.field)).not.toEqual(
        expect.arrayContaining(["code"]),
      );
      expect(rows.map((row) => row.field)).not.toContain("email");
      expect(rows.map((row) => row.field)).not.toContain("campaignId");
      expect(JSON.stringify(rows)).not.toContain("s3cret");
    });

    it("writes a form with several fields as one event", async () => {
      const item = await createItem();

      await updateItem(item.id, { set: { name: "Boss", description: "Big" } });

      const event = await latestEvent(item.id);
      const changes = await fieldRows(item.id);

      expect(event.entityVersion).toBe(2);
      expect(changes.filter((row) => row.entityVersion === 2).map((row) => row.field).sort()).toEqual([
        "description",
        "name",
      ]);
    });

    it("saves nothing when a rule across fields fails", async () => {
      const item = await createItem();
      const error = await catchError(updateItem(item.id, { set: { name: "Boss", maxHp: 5 } }));

      expect(error).toBeInstanceOf(ConflictError);
      expect((await currentItem(item.id)).name).toBe("Goblin");
      expect((await currentItem(item.id)).version).toBe(1);
      expect((await latestEvent(item.id)).entityVersion).toBe(1);
    });

    it("writes no entry and no version when nothing changes", async () => {
      const item = await createItem();
      const result = await updateItem(item.id, { set: { name: "Goblin" } });

      expect(result.changed).toBe(false);
      expect((await currentItem(item.id)).version).toBe(1);
      expect(await fieldRows(item.id, "name")).toHaveLength(1);
    });

    describe("forms based on an older version", () => {
      it("keeps both changes when different fields changed", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } }, GM);
        await updateItem(item.id, { set: { description: "Mine" }, baseVersion: 1 }, EDITOR);

        const row = await currentItem(item.id);

        expect(row.name).toBe("Boss");
        expect(row.description).toBe("Mine");
      });

      it("does not overwrite with an untouched old value from a full form", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } }, GM);

        const result = await updateItem(
          item.id,
          { set: { name: "Goblin", description: "Mine" }, baseVersion: 1 },
          EDITOR,
        );

        expect(result.merged).toEqual(["name"]);
        expect((await currentItem(item.id)).name).toBe("Boss");
        expect((await currentItem(item.id)).description).toBe("Mine");
      });

      it("rejects the whole form when the same field changed differently", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } }, GM);

        const error = await catchError(
          updateItem(item.id, { set: { name: "King", description: "Mine" }, baseVersion: 1 }, EDITOR),
        );

        expect(error).toBeInstanceOf(VersionConflictError);
        expect(error.details).toMatchObject({
          currentVersion: 2,
          conflicts: [
            { field: "name", yours: "King", current: "Boss", changedBy: ID.gm },
          ],
        });
        expect((await currentItem(item.id)).description).toBeNull();
      });

      it("accepts the same value from both sides", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } }, GM);

        const result = await updateItem(item.id, { set: { name: "Boss" }, baseVersion: 1 }, EDITOR);

        expect(result.changed).toBe(false);
      });

      it("treats grouped fields as one unit", async () => {
        const item = await createItem({ policy: "OPEN", scope: "ALL" });

        await updateItem(item.id, { set: { scope: "SOME" } }, GM);

        const error = await catchError(
          updateItem(item.id, { set: { policy: "CLOSED", scope: "ALL" }, baseVersion: 1 }, EDITOR),
        );

        expect(error).toBeInstanceOf(VersionConflictError);
      });

      it("rejects a version from the future", async () => {
        const item = await createItem();
        const error = await catchError(updateItem(item.id, { set: { name: "X" }, baseVersion: 9 }));

        expect(error).toBeInstanceOf(VersionConflictError);
      });

      it("gives a conflict when the base was already trimmed", async () => {
        const item = await createItem({ busy: 0 });

        for (let index = 0; index < 40; index += 1) {
          await updateItem(item.id, { set: { name: `Name ${index}` } });
        }

        const horizons = await db
          .select()
          .from(entityHistoryHorizons)
          .where(eq(entityHistoryHorizons.entityId, item.id));

        expect(horizons.length).toBeGreaterThan(0);

        const error = await catchError(
          updateItem(item.id, { set: { name: "Goblin" }, baseVersion: 2 }, EDITOR),
        );

        expect(error).toBeInstanceOf(VersionConflictError);
      }, 30_000);

      it("lets sorting win without a conflict", async () => {
        const item = await createItem({ sortOrder: "a" });

        await updateItem(item.id, { set: { sortOrder: "b" } }, GM);

        const result = await updateItem(item.id, { set: { sortOrder: "c" }, baseVersion: 1 }, EDITOR);

        expect(result.changed).toBe(true);
        expect((await currentItem(item.id)).sortOrder).toBe("c");
      });
    });

    describe("counters", () => {
      it("stores the applied delta at the limit", async () => {
        const item = await createItem({ hp: 3 });

        await updateItem(item.id, { inc: { hp: -5 } });

        const [, change] = await fieldRows(item.id, "hp");

        expect((await currentItem(item.id)).hp).toBe(0);
        expect(change?.delta).toBe(-3);
      });

      it("respects a maximum that depends on the row", async () => {
        const item = await createItem({ hp: 19 });

        await updateItem(item.id, { inc: { hp: 5 } });

        expect((await currentItem(item.id)).hp).toBe(20);
      });

      it("writes no entry when the limit leaves nothing to change", async () => {
        const item = await createItem({ hp: 0 });
        const result = await updateItem(item.id, { inc: { hp: -1 } });

        expect(result.changed).toBe(false);
        expect((await currentItem(item.id)).version).toBe(1);
      });

      it("counts every parallel change", async () => {
        const item = await createItem({ hp: 20 });

        await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            updateItem(item.id, { inc: { hp: -1 } }, index % 2 === 0 ? GM : PLAYER),
          ),
        );

        const row = await currentItem(item.id);

        expect(row.hp).toBe(12);
        expect(row.version).toBe(9);
        expect(await fieldRows(item.id, "hp")).toHaveLength(9);
      }, 20_000);
    });

    describe("versions", () => {
      it("returns the state of a version", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } });
        await updateItem(item.id, { inc: { hp: -2 } });

        const v1 = await history.getVersion(ADMIN, { entityType: "item", entityId: item.id, version: 1 });
        const v2 = await history.getVersion(ADMIN, { entityType: "item", entityId: item.id, version: 2 });
        const v3 = await history.getVersion(ADMIN, { entityType: "item", entityId: item.id, version: 3 });

        expect(v1.values).toMatchObject({ name: "Goblin", hp: 10 });
        expect(v2.values).toMatchObject({ name: "Boss", hp: 10 });
        expect(v3.values).toMatchObject({ name: "Boss", hp: 8 });
        expect(v1.incomplete).toEqual([]);
      });

      it("marks trimmed fields as incomplete but keeps version 1", async () => {
        const item = await createItem();

        for (let index = 0; index < 40; index += 1) {
          await updateItem(item.id, { set: { name: `Name ${index}` } });
        }

        const old = await history.getVersion(ADMIN, { entityType: "item", entityId: item.id, version: 5 });
        const first = await history.getVersion(ADMIN, { entityType: "item", entityId: item.id, version: 1 });

        expect(old.incomplete).toContain("name");
        expect(old.values).not.toHaveProperty("name");
        expect(first.incomplete).toEqual([]);
        expect(first.values).toMatchObject({ name: "Goblin" });
      }, 30_000);

      it("answers 404 for a version that does not exist", async () => {
        const item = await createItem();

        expect((await get(ADMIN, `/history/item/${item.id}/versions/9`)).statusCode).toBe(404);
      });
    });

    describe("revert", () => {
      it("restores the previous value as a new action", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } });

        const event = await latestEvent(item.id);
        const response = await post(GM, `/history/events/${event.id}/revert`, { reason: "Oops" });
        const row = await currentItem(item.id);
        const revert = await latestEvent(item.id);

        expect(response.statusCode).toBe(200);
        expect(row.name).toBe("Goblin");
        expect(row.version).toBe(3);
        expect(revert).toMatchObject({ revertsEventId: event.id, action: "history.revert", reason: "Oops" });
        expect(await fieldRows(item.id, "name")).toHaveLength(3);
      });

      it("rejects undoing a value someone changed later", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } });

        const event = await latestEvent(item.id);

        await updateItem(item.id, { set: { name: "King" } });

        const response = await post(GM, `/history/events/${event.id}/revert`);

        expect(response.statusCode).toBe(412);
        expect((await currentItem(item.id)).name).toBe("King");
      });

      it("undoes a counter by its applied delta, also after other changes", async () => {
        const item = await createItem({ hp: 3 });

        await updateItem(item.id, { inc: { hp: -5 } });

        const event = await latestEvent(item.id);

        await updateItem(item.id, { inc: { hp: 2 } });

        expect((await post(GM, `/history/events/${event.id}/revert`)).statusCode).toBe(200);
        expect((await currentItem(item.id)).hp).toBe(5);
      });

      it("undoes only the requested fields", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss", description: "Big" } });

        const event = await latestEvent(item.id);
        const response = await post(GM, `/history/events/${event.id}/revert`, { fields: ["name"] });
        const row = await currentItem(item.id);

        expect(response.statusCode).toBe(200);
        expect(row.name).toBe("Goblin");
        expect(row.description).toBe("Big");
      });

      it("does not undo the same change twice", async () => {
        const item = await createItem({ hp: 10 });

        await updateItem(item.id, { inc: { hp: -5 } });

        const event = await latestEvent(item.id);

        expect((await post(GM, `/history/events/${event.id}/revert`)).statusCode).toBe(200);
        expect((await post(GM, `/history/events/${event.id}/revert`)).statusCode).toBe(409);
        expect((await currentItem(item.id)).hp).toBe(10);
      });

      it("can undo a revert", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } });
        await post(GM, `/history/events/${(await latestEvent(item.id)).id}/revert`);

        expect((await currentItem(item.id)).name).toBe("Goblin");

        const response = await post(GM, `/history/events/${(await latestEvent(item.id)).id}/revert`);

        expect(response.statusCode).toBe(200);
        expect((await currentItem(item.id)).name).toBe("Boss");
      });

      it("cannot undo the first version", async () => {
        const item = await createItem();
        const response = await post(ADMIN, `/history/events/${(await latestEvent(item.id)).id}/revert`);

        expect(response.statusCode).toBe(409);
      });

      it("cannot undo an action marked as not revertible", async () => {
        const item = await createItem();

        await history.runAction(
          { action: "item.notify", context: GM, authorize: allow, revertible: false },
          (scope) => scope.change(trackedItem, item.id, () => ({ set: { name: "Boss" } })),
        );

        const response = await post(ADMIN, `/history/events/${(await latestEvent(item.id)).id}/revert`);

        expect(response.statusCode).toBe(409);
      });

      it("explains when the previous value was trimmed", async () => {
        const item = await createItem();

        for (let index = 0; index < 40; index += 1) {
          await updateItem(item.id, { set: { name: `Name ${index}` } });
        }

        const rows = await fieldRows(item.id, "name");
        const oldest = rows.find((row) => !row.isBaseline);

        await updateItem(item.id, { set: { name: oldest?.newValue } });

        const response = await post(GM, `/history/events/${oldest?.eventId}/revert`);

        expect(response.statusCode).toBe(409);
        expect(response.json().error.details).toEqual({ fields: ["name"] });
      }, 30_000);

      it("returns the details of a conflict over HTTP", async () => {
        const item = await createItem();

        await updateItem(item.id, { set: { name: "Boss" } });

        const event = await latestEvent(item.id);

        await updateItem(item.id, { set: { name: "King" } });

        const response = await post(GM, `/history/events/${event.id}/revert`);

        expect(response.json().error).toMatchObject({
          code: "VERSION_CONFLICT",
          details: { currentVersion: 3, conflicts: [{ field: "name" }] },
        });
      });

      it("does not bring back a deleted row", async () => {
        const item = await createItem();

        await history.runAction({ action: "item.delete", context: GM, authorize: allow }, (scope) =>
          scope.softDelete(trackedItem, item.id),
        );

        const response = await post(ADMIN, `/history/events/${(await latestEvent(item.id)).id}/revert`);

        expect(response.statusCode).toBe(404);
        expect((await currentItem(item.id)).deletedAt).not.toBeNull();
      });

      it("undoes nothing when a row of the action was deleted by now", async () => {
        const first = await createItem({ name: "First" });
        const second = await createItem({ name: "Second" });

        const actionId = await history.runAction({ action: "item.rename", context: GM, authorize: allow }, async (scope) => {
          await scope.change(trackedItem, first.id, () => ({ set: { name: "A" } }));
          await scope.change(trackedItem, second.id, () => ({ set: { name: "B" } }));

          return scope.actionId;
        });

        await history.runAction({ action: "item.delete", context: GM, authorize: allow }, (scope) =>
          scope.softDelete(trackedItem, second.id),
        );

        expect((await post(GM, `/history/actions/${actionId}/revert`)).statusCode).toBe(404);
        expect((await currentItem(first.id)).name).toBe("A");
      });

      it("undoes a whole action over several rows", async () => {
        const first = await createItem({ name: "First" });
        const second = await createItem({ name: "Second" });

        const actionId = await history.runAction({ action: "item.rename", context: GM, authorize: allow }, async (scope) => {
          await scope.change(trackedItem, first.id, () => ({ set: { name: "A" } }));
          await scope.change(trackedItem, second.id, () => ({ set: { name: "B" } }));

          return scope.actionId;
        });

        expect((await post(GM, `/history/actions/${actionId}/revert`)).statusCode).toBe(200);
        expect((await currentItem(first.id)).name).toBe("First");
        expect((await currentItem(second.id)).name).toBe("Second");
      });

      it("undoes nothing when one row of an action fails", async () => {
        const first = await createItem({ name: "First" });
        const second = await createItem({ name: "Second" });

        const actionId = await history.runAction({ action: "item.rename", context: GM, authorize: allow }, async (scope) => {
          await scope.change(trackedItem, first.id, () => ({ set: { name: "A" } }));
          await scope.change(trackedItem, second.id, () => ({ set: { name: "B" } }));

          return scope.actionId;
        });

        await updateItem(second.id, { set: { name: "Later" } });

        expect((await post(GM, `/history/actions/${actionId}/revert`)).statusCode).toBe(412);
        expect((await currentItem(first.id)).name).toBe("A");
        expect((await currentItem(second.id)).name).toBe("Later");
      });
    });

    describe("restore", () => {
      it("restores the first version as a new action", async () => {
        const item = await createItem({ description: "Original", hp: 10 });

        await updateItem(item.id, { set: { name: "Boss", description: "Changed" } });
        await updateItem(item.id, { inc: { hp: -4 } });

        const response = await post(GM, `/history/item/${item.id}/versions/1/restore`);
        const row = await currentItem(item.id);
        const event = await latestEvent(item.id);

        expect(response.statusCode).toBe(200);
        expect(row).toMatchObject({ name: "Goblin", description: "Original", hp: 10, version: 4 });
        expect(event).toMatchObject({ action: "history.restore", restoredFromVersion: 1 });

        const [, ...rest] = await fieldRows(item.id, "name");

        expect(rest).toHaveLength(2);
      });

      it("leaves not revertible fields unchanged", async () => {
        const item = await createItem({ role: "PLAYER" });

        await updateItem(item.id, { set: { role: "ADMIN", name: "Boss" } });

        expect((await post(GM, `/history/item/${item.id}/versions/1/restore`)).statusCode).toBe(200);

        const row = await currentItem(item.id);

        expect(row.name).toBe("Goblin");
        expect(row.role).toBe("ADMIN");
      });

      it("rejects old values that no longer pass the rules", async () => {
        const item = await createItem({ name: "Al" });

        await updateItem(item.id, { set: { name: "Alice" } });

        const response = await post(GM, `/history/item/${item.id}/versions/1/restore`);

        expect(response.statusCode).toBe(409);
        expect((await currentItem(item.id)).name).toBe("Alice");
      });

      it("rejects an incomplete version", async () => {
        const item = await createItem();

        for (let index = 0; index < 40; index += 1) {
          await updateItem(item.id, { set: { name: `Name ${index}` } });
        }

        const response = await post(GM, `/history/item/${item.id}/versions/5/restore`);

        expect(response.statusCode).toBe(409);
        expect(response.json().error.details).toEqual({ fields: expect.arrayContaining(["name"]) });
      }, 30_000);
    });

    describe("repeated requests", () => {
      const damage = (id: string, key: string, by: TestActor = GM) =>
        history.runAction(
          {
            action: "item.damage",
            context: by, authorize: allow,
            idempotency: { key, onReplay: async () => currentItem(id) },
          },
          async (scope) => (await scope.change(trackedItem, id, () => ({ inc: { hp: -3 } }))).row,
        );

      it("applies a repeated key only once", async () => {
        const item = await createItem({ hp: 10 });

        await damage(item.id, "key-1");
        const replay = await damage(item.id, "key-1");

        expect(replay.hp).toBe(7);
        expect((await currentItem(item.id)).hp).toBe(7);
      });

      it("keeps keys of different actors apart", async () => {
        const item = await createItem({ hp: 10 });

        await damage(item.id, "same-key", GM);
        await damage(item.id, "same-key", EDITOR);

        expect((await currentItem(item.id)).hp).toBe(4);
      });

      it("frees the key when the action fails", async () => {
        const item = await createItem({ hp: 10 });
        const failing = history.runAction(
          {
            action: "item.damage",
            context: GM, authorize: allow,
            idempotency: { key: "retry", onReplay: async () => null },
          },
          async () => {
            throw new ConflictError("failed");
          },
        );

        await expect(failing).rejects.toBeInstanceOf(ConflictError);
        await damage(item.id, "retry");

        expect((await currentItem(item.id)).hp).toBe(7);
      });
    });

    describe("events", () => {
      it("publishes after the commit, without values", async () => {
        const seen: HistoryEvent[] = [];
        let committed = false;

        history.subscribe("item.named", async (event) => {
          const [row] = await db.select().from(items).where(eq(items.id, event.entityId));

          committed = row?.name === "Secret name";
          seen.push(event);
        });

        const item = await createItem();

        await updateItem(item.id, { set: { name: "Secret name" } }, GM, "item.named");

        expect(committed).toBe(true);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ entityId: item.id, fields: ["name"], actorId: ID.gm });
        expect(JSON.stringify(seen[0])).not.toContain("Secret name");
      });

      it("publishes nothing after a rollback", async () => {
        const seen: HistoryEvent[] = [];

        history.subscribe("item.rollback", (event) => {
          seen.push(event);
        });

        const item = await createItem();

        await expect(
          history.runAction({ action: "item.rollback", context: GM, authorize: allow }, async (scope) => {
            await scope.change(trackedItem, item.id, () => ({ set: { name: "Boss" } }));
            throw new ConflictError("failed");
          }),
        ).rejects.toBeInstanceOf(ConflictError);

        expect(seen).toEqual([]);
        expect((await currentItem(item.id)).name).toBe("Goblin");
      });
    });
  });

  describe("write actions", () => {
    /** Damage only on own rows, or for the GM of the campaign. */
    class DamageItemUseCase extends MutationUseCase<
      { id: string; amount: number; reason?: string },
      typeof items.$inferSelect
    > {
      protected readonly action = "item.damage";

      protected async authorize(
        context: RequestContext,
        input: { id: string },
        tx: AppDatabase,
      ) {
        const [row] = await tx.select().from(items).where(eq(items.id, input.id));
        const role =
          row && context.actorId ? await resolveRole(row.campaignId, context.actorId, tx) : null;

        if (role !== "OWNER" && row?.ownerId !== context.actorId) {
          throw new ForbiddenError("Insufficient permissions");
        }

        return authorized();
      }

      protected async perform(
        scope: ActionScope,
        _context: RequestContext,
        input: { id: string; amount: number },
      ) {
        const { row } = await scope.change(trackedItem, input.id, () => ({
          inc: { hp: -input.amount },
        }));

        return row;
      }

      protected override onReplay = async (
        _context: RequestContext,
        input: { id: string },
      ) => currentItem(input.id);

      protected override reasonOf(input: { reason?: string }) {
        return input.reason ?? null;
      }
    }

    const damage = () => new DamageItemUseCase(history);

    it("runs an allowed action and stores who did it and why", async () => {
      const item = await createItem({ ownerId: ID.player, hp: 10 });
      const row = await damage().execute(PLAYER, { id: item.id, amount: 3, reason: "Trap" });

      expect(row.hp).toBe(7);
      expect(await latestEvent(item.id)).toMatchObject({
        action: "item.damage",
        actorId: ID.player,
        reason: "Trap",
      });
    });

    it.each<[string, TestActor]>([
      ["another player", OTHER_PLAYER],
      ["outsider", OUTSIDER],
      ["removed member", REMOVED],
    ])("rejects %s and changes nothing", async (_name, by) => {
      const item = await createItem({ ownerId: ID.player, hp: 10 });

      await expect(damage().execute(by, { id: item.id, amount: 3 })).rejects.toBeInstanceOf(
        ForbiddenError,
      );

      expect((await currentItem(item.id)).hp).toBe(10);
      expect((await latestEvent(item.id)).entityVersion).toBe(1);
    });

    it("does not use up an idempotency key when denied", async () => {
      const item = await createItem({ ownerId: ID.player, hp: 10 });

      await expect(
        damage().execute(OTHER_PLAYER, { id: item.id, amount: 3 }, { idempotencyKey: "denied" }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(await db.select().from(historyIdempotencyKeys)).toEqual([]);
    });

    it("checks a repeated request again after the right was lost", async () => {
      const item = await createItem({ ownerId: ID.player, hp: 10 });

      await damage().execute(PLAYER, { id: item.id, amount: 3 }, { idempotencyKey: "again" });
      await db.update(items).set({ ownerId: ID.otherPlayer }).where(eq(items.id, item.id));

      await expect(
        damage().execute(PLAYER, { id: item.id, amount: 3 }, { idempotencyKey: "again" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("applies a repeated request only once", async () => {
      const item = await createItem({ ownerId: ID.player, hp: 10 });

      await damage().execute(PLAYER, { id: item.id, amount: 3 }, { idempotencyKey: "once" });

      const replay = await damage().execute(
        PLAYER,
        { id: item.id, amount: 3 },
        { idempotencyKey: "once" },
      );

      expect(replay.hp).toBe(7);
    });

    it("runs the check in the transaction of the action", async () => {
      const item = await createItem({ ownerId: ID.player, hp: 10 });

      await history.runAction(
        {
          action: "item.check",
          context: GM,
          authorize: async (tx) => {
            await tx.update(items).set({ description: "In transaction" }).where(eq(items.id, item.id));

            return authorized();
          },
        },
        async () => {
          throw new ConflictError("failed");
        },
      ).catch(() => undefined);

      expect((await currentItem(item.id)).description).toBeNull();
    });

    it("rejects a check that returns no authorization", async () => {
      const item = await createItem();

      await expect(
        history.runAction(
          {
            action: "item.broken",
            context: GM,
            authorize: (async () => ({ kind: "authorized", reason: null })) as never,
          },
          (scope) => scope.change(trackedItem, item.id, () => ({ set: { name: "Boss" } })),
        ),
      ).rejects.toThrow(/no authorization/);

      expect((await currentItem(item.id)).name).toBe("Goblin");
    });
  });

  describe("configuration", () => {
    it("trims only when the buffer is full and never the first version", async () => {
      const item = await createItem();

      for (let index = 1; index <= 24; index += 1) {
        await updateItem(item.id, { inc: { busy: 1 } });
      }

      // minimal: 5 entries, buffer 20. The first version is one extra row.
      expect(await fieldRows(item.id, "busy")).toHaveLength(25);

      await updateItem(item.id, { inc: { busy: 1 } });

      const rows = await fieldRows(item.id, "busy");

      expect(rows).toHaveLength(6);
      expect(rows[0]?.isBaseline).toBe(true);
      expect(rows.at(-1)?.entityVersion).toBe(26);
      expect((await currentItem(item.id)).busy).toBe(25);
    }, 20_000);

    it("uses the level of the field before that of the entity", async () => {
      const item = await createItem();

      for (let index = 0; index < 40; index += 1) {
        await updateItem(item.id, { set: { name: `Name ${index}`, description: `Text ${index}` } });
      }

      // name uses the entity level low (20), description its own level high (200).
      expect(await fieldRows(item.id, "name")).toHaveLength(21);
      expect(await fieldRows(item.id, "description")).toHaveLength(41);
    }, 30_000);

    it("falls back to the default level", async () => {
      const child = await history.runAction({ action: "child.create", context: GM, authorize: allow }, (scope) =>
        scope.create(trackedChild, { campaignId: ID.campaignA, parentId: ID.campaignA, title: "T" }),
      );

      for (let index = 0; index < 70; index += 1) {
        await history.runAction({ action: "child.update", context: GM, authorize: allow }, (scope) =>
          scope.change(trackedChild, child.id, () => ({ set: { title: `T${index}` } })),
        );
      }

      // standard: 50 entries plus the first version.
      expect(await fieldRows(child.id, "title")).toHaveLength(51);
    }, 30_000);

    it("removes events only when no field is left", async () => {
      const item = await createItem();

      for (let index = 1; index <= 25; index += 1) {
        await updateItem(item.id, { inc: { busy: 1 } });
      }

      const events = await db
        .select()
        .from(entityChangeEvents)
        .where(eq(entityChangeEvents.entityId, item.id));

      // Version 1 stays because of the first version, the five newest stay as well.
      expect(events.map((event) => event.entityVersion).sort((a, b) => a - b)).toEqual([
        1, 22, 23, 24, 25, 26,
      ]);
    }, 20_000);

    it("stores secrets and account data only as metadata", async () => {
      const item = await createItem({ code: "old-code", email: "old@b.test" });

      await updateItem(item.id, { set: { code: "new-code", email: "new@b.test" } });

      const rows = await fieldRows(item.id);
      const metadata = rows.filter((row) => row.field === "code" || row.field === "email");

      expect(metadata.map((row) => row.kind).sort()).toEqual(["account", "secret"]);
      expect(metadata.every((row) => row.newValue === null)).toBe(true);
      expect(JSON.stringify(rows)).not.toMatch(/code"?:?.*(old|new)-code/);
      expect((await currentItem(item.id)).code).toBe("new-code");
    });

    it("cannot undo secrets, account data or not revertible fields, not even as admin", async () => {
      const item = await createItem({ code: "old", email: "old@b.test", role: "PLAYER" });

      for (const set of [{ code: "new" }, { email: "new@b.test" }, { role: "ADMIN" }]) {
        await updateItem(item.id, { set });

        const response = await post(ADMIN, `/history/events/${(await latestEvent(item.id)).id}/revert`);

        expect(response.statusCode).toBe(409);
      }
    });

    it("gives a conflict without values for secrets", async () => {
      const item = await createItem({ code: "old" });

      await updateItem(item.id, { set: { code: "theirs" } });

      const error = await catchError(
        updateItem(item.id, { set: { code: "mine" }, baseVersion: 1 }, ADMIN),
      );

      expect(error).toBeInstanceOf(VersionConflictError);
      expect(JSON.stringify(error.details)).not.toMatch(/theirs|mine/);
    });

    it("writes ignored columns without an entry or new version", async () => {
      const item = await createItem();
      const before = (await currentItem(item.id)).version;
      const result = await updateItem(item.id, { set: { lastSeenAt: new Date() } });

      expect(result.changed).toBe(true);
      expect((await currentItem(item.id)).lastSeenAt).not.toBeNull();
      expect((await currentItem(item.id)).version).toBe(before);
      expect((await latestEvent(item.id)).entityVersion).toBe(1);
    });

    it("rejects unknown fields and increments on fields that are no counters", async () => {
      const item = await createItem();

      await expect(updateItem(item.id, { set: { ghost: 1 } })).rejects.toBeInstanceOf(ValidationError);
      await expect(updateItem(item.id, { set: { deletedAt: new Date() } })).rejects.toBeInstanceOf(
        ValidationError,
      );
      await expect(updateItem(item.id, { inc: { name: 1 } })).rejects.toBeInstanceOf(ValidationError);
    });

    it("does not change a deleted row", async () => {
      const item = await createItem();

      await history.runAction({ action: "item.delete", context: GM, authorize: allow }, (scope) =>
        scope.softDelete(trackedItem, item.id),
      );

      await expect(updateItem(item.id, { set: { name: "Boss" } })).rejects.toBeInstanceOf(NotFoundError);
    });

    it("offers no history for a deleted row, also not to admins", async () => {
      const item = await createItem();

      await updateItem(item.id, { set: { name: "Boss" } });
      await history.runAction({ action: "item.delete", context: GM, authorize: allow }, (scope) =>
        scope.softDelete(trackedItem, item.id),
      );

      for (const actor of [GM, ADMIN]) {
        expect((await get(actor, `/history/item/${item.id}`)).statusCode).toBe(404);
        expect((await get(actor, `/history/item/${item.id}/versions/1`)).statusCode).toBe(404);
        expect((await post(actor, `/history/item/${item.id}/versions/1/restore`)).statusCode).toBe(404);
      }

      expect((await currentItem(item.id)).deletedAt).not.toBeNull();
      expect((await fieldRows(item.id)).length).toBeGreaterThan(0);
    });
  });

  describe("permissions", () => {
    async function seed() {
      const owned = await createItem({ ownerId: ID.player, name: "Owned" });
      const hidden = await createItem({ shared: false, name: "Hidden" });

      await updateItem(owned.id, { set: { description: "By player" } }, PLAYER);

      return { owned, hidden, playerEvent: await latestEvent(owned.id) };
    }

    it.each<[string, TestActor, number]>([
      ["GM", GM, 200],
      ["editor", EDITOR, 200],
      ["player", PLAYER, 200],
      ["other player", OTHER_PLAYER, 404],
      ["admin", ADMIN, 200],
      ["outsider", OUTSIDER, 404],
      ["removed member", REMOVED, 404],
    ])("reading the row of a player as %s gives %i", async (_name, by, status) => {
      const { owned } = await seed();

      expect((await get(by, `/history/item/${owned.id}`)).statusCode).toBe(status);
      expect((await get(by, `/history/item/${owned.id}/versions/1`)).statusCode).toBe(status);
    });

    it.each<[string, TestActor, number]>([
      ["GM", GM, 200],
      ["editor", EDITOR, 200],
      ["admin", ADMIN, 200],
      ["player", PLAYER, 404],
      ["outsider", OUTSIDER, 404],
    ])("reading a row owned by nobody in the test as %s gives %i", async (_name, by, status) => {
      const { hidden } = await seed();

      expect((await get(by, `/history/item/${hidden.id}`)).statusCode).toBe(status);
      expect((await get(by, `/history/item/${hidden.id}/versions/1`)).statusCode).toBe(status);
    });

    it("needs a login", async () => {
      const { owned, playerEvent } = await seed();

      expect((await app.inject({ method: "GET", url: `/api/v1/history/item/${owned.id}` })).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/v1/history/events/${playerEvent.id}/revert`,
            payload: {},
          })
        ).statusCode,
      ).toBe(401);
    });

    it.each<[string, TestActor, number]>([
      ["the acting player on an own row", PLAYER, 200],
      ["another player", OTHER_PLAYER, 404],
      ["editor", EDITOR, 200],
      ["GM", GM, 200],
      ["admin", ADMIN, 200],
      ["outsider", OUTSIDER, 404],
      ["removed member", REMOVED, 404],
    ])("undoing a player change as %s gives %i", async (_name, by, status) => {
      const { owned, playerEvent } = await seed();
      const response = await post(by, `/history/events/${playerEvent.id}/revert`);

      expect(response.statusCode).toBe(status);
      expect((await currentItem(owned.id)).description).toBe(status === 200 ? null : "By player");
    });

    it("does not let a player undo a change by the GM", async () => {
      const { owned } = await seed();

      await updateItem(owned.id, { set: { name: "By GM" } }, GM);

      const response = await post(PLAYER, `/history/events/${(await latestEvent(owned.id)).id}/revert`);

      expect(response.statusCode).toBe(403);
      expect((await currentItem(owned.id)).name).toBe("By GM");
    });

    it("does not let a player undo their change on a row of someone else", async () => {
      const item = await createItem({ ownerId: ID.otherPlayer });

      await updateItem(item.id, { set: { name: "By player" } }, PLAYER);

      const response = await post(PLAYER, `/history/events/${(await latestEvent(item.id)).id}/revert`);

      expect(response.statusCode).toBe(404);
    });

    it("rejects a mixed action as a whole", async () => {
      const own = await createItem({ ownerId: ID.player, name: "Own" });
      const foreign = await createItem({ ownerId: ID.otherPlayer, name: "Foreign" });

      const actionId = await history.runAction({ action: "item.rename", context: PLAYER, authorize: allow }, async (scope) => {
        await scope.change(trackedItem, own.id, () => ({ set: { name: "A" } }));
        await scope.change(trackedItem, foreign.id, () => ({ set: { name: "B" } }));

        return scope.actionId;
      });

      expect((await post(PLAYER, `/history/actions/${actionId}/revert`)).statusCode).toBe(404);
      expect((await currentItem(own.id)).name).toBe("A");
      expect((await currentItem(foreign.id)).name).toBe("B");
    });

    it.each<[string, TestActor, number]>([
      ["GM", GM, 200],
      ["admin", ADMIN, 200],
      ["editor", EDITOR, 403],
      ["player", PLAYER, 403],
      ["outsider", OUTSIDER, 404],
      ["removed member", REMOVED, 404],
    ])("restoring a version as %s gives %i", async (_name, by, status) => {
      const { owned } = await seed();
      const response = await post(by, `/history/item/${owned.id}/versions/1/restore`);

      expect(response.statusCode).toBe(status);
      expect((await currentItem(owned.id)).description).toBe(status === 200 ? null : "By player");
    });

    it("shows admins as normal actors", async () => {
      const item = await createItem();

      await updateItem(item.id, { set: { name: "By admin" } }, ADMIN);

      const body = (await get(GM, `/history/item/${item.id}?field=name`)).json();

      expect(body.data[0]).toMatchObject({ actorId: ID.admin, value: "By admin" });
    });

    it("ignores the campaign header for ids of another campaign", async () => {
      const { owned, playerEvent } = await seed();
      const headers = { "x-campaign-id": ID.campaignB };

      expect((await get(OUTSIDER, `/history/item/${owned.id}`, headers)).statusCode).toBe(404);

      const revert = await injectAs(OUTSIDER, {
        method: "POST",
        url: `/api/v1/history/events/${playerEvent.id}/revert`,
        headers,
        payload: {},
      });

      expect(revert.statusCode).toBe(404);
      expect((await currentItem(owned.id)).description).toBe("By player");
    });

    it("answers alike for unknown types, unknown ids and forbidden rows", async () => {
      const { owned } = await seed();
      const missingId = "d0000000-0000-4000-8000-000000000000";
      const responses = await Promise.all([
        get(OUTSIDER, `/history/item/${owned.id}`),
        get(OUTSIDER, `/history/item/${missingId}`),
        get(OUTSIDER, `/history/users/${owned.id}`),
      ]);

      for (const response of responses) {
        expect(response.statusCode).toBe(404);
      }

      const [first, ...others] = responses.map((response) => response.json().error);

      expect(first.message).toBe("Resource not found");

      for (const other of others) {
        expect(other.message).toBe(first.message);
        expect(other.code).toBe(first.code);
      }
    });

    it("answers 404 for an unknown field", async () => {
      const { owned } = await seed();

      expect((await get(GM, `/history/item/${owned.id}?field=ghost`)).statusCode).toBe(404);
    });

    it("hides fields in lists, versions and conflicts", async () => {
      const item = await createItem({ gmNotes: "Secret plan", ownerId: ID.player });

      await updateItem(item.id, { set: { gmNotes: "New secret plan" } }, GM);

      const list = await get(PLAYER, `/history/item/${item.id}`);
      const version = await get(PLAYER, `/history/item/${item.id}/versions/1`);
      const filtered = await get(PLAYER, `/history/item/${item.id}?field=gmNotes`);

      expect(list.statusCode).toBe(200);
      expect(list.body).not.toContain("Secret plan");
      expect(list.json().data.map((row: { field: string }) => row.field)).not.toContain("gmNotes");
      expect(version.json().values).not.toHaveProperty("gmNotes");
      expect(version.body).not.toContain("Secret plan");
      expect(filtered.json().data).toEqual([]);

      const error = await catchError(
        updateItem(item.id, { set: { gmNotes: "Player guess" }, baseVersion: 1 }, PLAYER),
      );

      expect(error).toBeInstanceOf(VersionConflictError);
      expect(JSON.stringify(error.details)).not.toContain("Secret plan");
    });

    it("shows hidden fields to GM and admin", async () => {
      const item = await createItem({ gmNotes: "Secret plan" });

      for (const by of [GM, ADMIN]) {
        expect((await get(by, `/history/item/${item.id}`)).body).toContain("Secret plan");
      }
    });

    it("does not let a player undo a hidden field", async () => {
      const item = await createItem({ ownerId: ID.player, gmNotes: "Plan" });

      await updateItem(item.id, { set: { gmNotes: "Plan B" } }, PLAYER);

      const response = await post(PLAYER, `/history/events/${(await latestEvent(item.id)).id}/revert`);

      expect(response.statusCode).toBe(403);
    });

    it("checks rights for each child in the combined view", async () => {
      const parent = await createItem({ ownerId: ID.player });
      const create = (title: string, shared: boolean) =>
        history.runAction({ action: "child.create", context: GM, authorize: allow }, (scope) =>
          scope.create(trackedChild, { campaignId: ID.campaignA, parentId: parent.id, title, shared }),
        );

      await create("Visible child", true);
      await create("Hidden child", false);

      const asPlayer = await get(PLAYER, `/history/item/${parent.id}?includeChildren=true`);
      const asGm = await get(GM, `/history/item/${parent.id}?includeChildren=true`);
      const withoutChildren = await get(GM, `/history/item/${parent.id}`);

      expect(asPlayer.body).toContain("Visible child");
      expect(asPlayer.body).not.toContain("Hidden child");
      expect(asGm.body).toContain("Hidden child");
      expect(withoutChildren.body).not.toContain("Visible child");
    });

    it("leaves deleted children out of the combined view", async () => {
      const parent = await createItem();
      const child = await history.runAction({ action: "child.create", context: GM, authorize: allow }, (scope) =>
        scope.create(trackedChild, { campaignId: ID.campaignA, parentId: parent.id, title: "Gone child", shared: true }),
      );

      await history.runAction({ action: "child.delete", context: GM, authorize: allow }, (scope) =>
        scope.softDelete(trackedChild, child.id),
      );

      const response = await get(ADMIN, `/history/item/${parent.id}?includeChildren=true`);

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("Gone child");
    });

    it("denies undoing when an entity defines no rule for it, except for admins", async () => {
      const row = await history.runAction({ action: "readonly.create", context: GM, authorize: allow }, (scope) =>
        scope.create(trackedReadOnly, { campaignId: ID.campaignA, parentId: ID.campaignA, title: "T" }),
      );

      await history.runAction({ action: "readonly.update", context: GM, authorize: allow }, (scope) =>
        scope.change(trackedReadOnly, row.id, () => ({ set: { title: "New" } })),
      );

      const event = await latestEvent(row.id);

      expect((await get(GM, `/history/readonly/${row.id}`)).statusCode).toBe(200);
      expect((await post(GM, `/history/events/${event.id}/revert`)).statusCode).toBe(403);
      expect((await post(GM, `/history/readonly/${row.id}/versions/1/restore`)).statusCode).toBe(403);
      expect((await post(ADMIN, `/history/events/${event.id}/revert`)).statusCode).toBe(200);
    });

    it("pages through the list", async () => {
      const item = await createItem();

      for (let index = 0; index < 3; index += 1) {
        await updateItem(item.id, { set: { name: `Name ${index}` } });
      }

      const first = (await get(GM, `/history/item/${item.id}?field=name&limit=2`)).json();
      const second = (
        await get(GM, `/history/item/${item.id}?field=name&limit=2&before=${first.nextBefore}`)
      ).json();

      expect(first.data.map((row: { value: string }) => row.value)).toEqual(["Name 2", "Name 1"]);
      expect(second.data.map((row: { value: string }) => row.value)).toEqual(["Name 0", "Goblin"]);
      expect(second.nextBefore).toBeNull();
    });
  });
});
