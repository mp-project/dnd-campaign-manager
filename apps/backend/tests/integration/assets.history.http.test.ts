import { and, eq, isNull } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetRulesets,
  assets,
  rulesets,
  users,
  campaigns,
  campaignMemberships,
} from "#core/db/schema";
import type { AppModule } from "#core/app/moduleSystem";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import { defaultAppModules } from "#src/modules/index";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset2014: "10000000-0000-4000-8000-000000002014",
  ruleset2024: "10000000-0000-4000-8000-000000002024",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  editor: "a0000000-0000-4000-8000-000000000005",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  systemSpell: "e0000000-0000-4000-8000-000000000001",
  sharedSpell: "e0000000-0000-4000-8000-000000000002",
  unsharedSpell: "e0000000-0000-4000-8000-000000000003",
} as const;

const GM: TestActor = { actorId: ID.gm, systemRole: "USER" };
const PLAYER: TestActor = { actorId: ID.player, systemRole: "USER" };
const OUTSIDER: TestActor = { actorId: ID.outsider, systemRole: "USER" };
const ADMIN: TestActor = { actorId: ID.admin, systemRole: "ADMIN" };
const EDITOR: TestActor = { actorId: ID.editor, systemRole: "USER" };

const visibilityModule: AppModule = {
  name: "test-asset-visibility",
  dependencies: ["assets"],
  register: (_app, container) => {
    container.dependencies
      .require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES)
      .service.registerVisibilityProvider({
        name: "test-shares",
        listVisibleAssetIds: async ({ actorId }) => (actorId === ID.player ? [ID.sharedSpell] : []),
      });
  },
};

type HistoryItem = {
  eventId: string;
  actionId: string;
  action: string;
  field: string;
  value: unknown;
  version: number;
  actorId: string | null;
  isBaseline: boolean;
};

describe("assets history", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp({ modules: [...defaultAppModules, visibilityModule] });

  beforeEach(async () => {
    await db.insert(rulesets).values(
      [ID.ruleset2014, ID.ruleset2024].map((id, index) => ({
        id,
        code: `DND_5E_IT_ASSET_HISTORY_${index}`,
        name: `Ruleset ${index}`,
        status: "ACTIVE" as const,
        editionYear: index === 0 ? 2014 : 2024,
        sourceReference: {},
        licenseCode: "TEST",
      })),
    );
    await db.insert(users).values(
      [ID.gm, ID.player, ID.outsider, ID.admin, ID.editor].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "Test",
        systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
    await db.insert(campaigns).values({
      id: ID.campaign,
      ownerUserId: ID.gm,
      rulesetId: ID.ruleset2024,
      name: "Campaign",
      slug: "campaign",
      status: "ACTIVE",
      createdBy: ID.gm,
    });
    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
    ]);

    const campaign = { scope: "CAMPAIGN", origin: "CUSTOM", campaignId: ID.campaign } as const;

    // Inserted directly, like rows that already existed before the history.
    await db.insert(assets).values([
      {
        id: ID.systemSpell,
        scope: "SYSTEM",
        origin: "DEFAULT",
        campaignId: null,
        assetType: "SPELL",
        title: "Light",
        slug: "light",
        status: "ACTIVE",
        rulesetPolicy: "RESTRICTED",
      },
      { ...campaign, id: ID.sharedSpell, assetType: "SPELL", title: "Ember", slug: "ember", status: "ACTIVE" },
      { ...campaign, id: ID.unsharedSpell, assetType: "SPELL", title: "Secret", slug: "secret", status: "ACTIVE" },
    ]);
    await db.insert(assetRulesets).values({ assetId: ID.systemSpell, rulesetId: ID.ruleset2014 });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const patch = (id: string, payload: Record<string, unknown>, actor = ADMIN) =>
    injectAs(actor, { method: "PATCH", url: `/api/v1/assets/${id}`, payload });

  const history = (id: string, actor = ADMIN) =>
    injectAs(actor, { method: "GET", url: `/api/v1/history/asset/${id}` });

  const version = (id: string, number: number, actor = ADMIN) =>
    injectAs(actor, { method: "GET", url: `/api/v1/history/asset/${id}/versions/${number}` });

  const revert = (eventId: string, actor = ADMIN) =>
    injectAs(actor, { method: "POST", url: `/api/v1/history/events/${eventId}/revert`, payload: {} });

  const restore = (id: string, number: number, actor = ADMIN) =>
    injectAs(actor, {
      method: "POST",
      url: `/api/v1/history/asset/${id}/versions/${number}/restore`,
      payload: {},
    });

  async function items(id: string): Promise<HistoryItem[]> {
    return (await history(id)).json().data as HistoryItem[];
  }

  async function latestEventId(id: string): Promise<string> {
    const [latest] = await items(id);

    return (latest as HistoryItem).eventId;
  }

  async function activeRulesets(id: string): Promise<string[]> {
    const rows = await db
      .select({ rulesetId: assetRulesets.rulesetId })
      .from(assetRulesets)
      .where(and(eq(assetRulesets.assetId, id), isNull(assetRulesets.deletedAt)));

    return rows.map((row) => row.rulesetId).sort();
  }

  describe("content", () => {
    it("records existing rows as a first version, then the change with its actor", async () => {
      const response = await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember II" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ version: 2, title: "Ember II", merged: [] });

      const entries = await items(ID.sharedSpell);

      expect(entries.find((item) => item.field === "title" && item.version === 2)).toMatchObject({
        action: "asset.update",
        value: "Ember II",
        actorId: ID.admin,
        isBaseline: false,
      });
      expect(entries.find((item) => item.field === "title" && item.version === 1)).toMatchObject({
        action: "history.baseline",
        value: "Ember",
        actorId: null,
        isBaseline: true,
      });
    });

    it("records nothing when no value changes", async () => {
      const response = await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember" });

      expect(response.json()).toMatchObject({ version: 1 });
      expect((await items(ID.sharedSpell)).every((item) => item.isBaseline)).toBe(true);
    });

    it("keeps changes of others when a stale form sends other fields", async () => {
      await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember II" });

      const stale = await patch(ID.sharedSpell, {
        expectedVersion: 1,
        title: "Ember",
        summary: "Hot",
      });

      expect(stale.statusCode).toBe(200);
      expect(stale.json()).toMatchObject({
        version: 3,
        title: "Ember II",
        summary: "Hot",
        merged: ["title"],
      });
    });

    it("rejects a stale change of the same field", async () => {
      await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember II" });

      const stale = await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember III" });

      expect(stale.statusCode).toBe(412);
    });

    it("treats a version older than the first entry as a conflict", async () => {
      await db.update(assets).set({ version: 5 }).where(eq(assets.id, ID.sharedSpell));

      const stale = await patch(ID.sharedSpell, { expectedVersion: 3, title: "Ember II" });

      expect(stale.statusCode).toBe(412);
    });

    it("undoes an update including the ruleset links", async () => {
      const updated = await patch(ID.systemSpell, {
        expectedVersion: 1,
        title: "Light II",
        rulesetIds: [ID.ruleset2024],
      });

      expect(updated.statusCode).toBe(200);
      expect(await activeRulesets(ID.systemSpell)).toEqual([ID.ruleset2024]);

      const undone = await revert(await latestEventId(ID.systemSpell));

      expect(undone.statusCode).toBe(200);
      expect(await activeRulesets(ID.systemSpell)).toEqual([ID.ruleset2014]);

      const [row] = await db.select().from(assets).where(eq(assets.id, ID.systemSpell));

      expect(row).toMatchObject({ title: "Light", version: 3 });
    });

    it("restores an old version including the ruleset links", async () => {
      await patch(ID.systemSpell, { expectedVersion: 1, rulesetIds: [ID.ruleset2024] });
      await patch(ID.systemSpell, { expectedVersion: 2, title: "Light II" });

      const old = await version(ID.systemSpell, 1);

      expect(old.json()).toMatchObject({
        values: { title: "Light", rulesetIds: [ID.ruleset2014] },
        incomplete: [],
      });

      const restored = await restore(ID.systemSpell, 1);

      expect(restored.statusCode).toBe(200);
      expect(await activeRulesets(ID.systemSpell)).toEqual([ID.ruleset2014]);
    });

    it("undoes archiving and keeps archived assets closed for other changes", async () => {
      const archive = () =>
        injectAs(ADMIN, {
          method: "DELETE",
          url: `/api/v1/assets/${ID.sharedSpell}?expectedVersion=1`,
        });

      expect((await archive()).json()).toMatchObject({ status: "ARCHIVED", version: 2 });

      const blocked = await patch(ID.sharedSpell, { expectedVersion: 2, title: "Ember II" });

      expect(blocked.statusCode).toBe(409);
      expect((await revert(await latestEventId(ID.sharedSpell))).statusCode).toBe(200);

      const [row] = await db.select().from(assets).where(eq(assets.id, ID.sharedSpell));

      expect(row).toMatchObject({ status: "ACTIVE", version: 3 });
    });

    describe("status after bringing back or resetting", () => {
      const draft = ID.unsharedSpell;

      const archive = (id: string, expectedVersion: number, actor = ADMIN) =>
        injectAs(actor, {
          method: "DELETE",
          url: `/api/v1/assets/${id}?expectedVersion=${expectedVersion}`,
        });

      const bringBack = (id: string, expectedVersion: number, actor = ADMIN) =>
        injectAs(actor, {
          method: "POST",
          url: `/api/v1/assets/${id}/restore`,
          payload: { expectedVersion },
        });

      const statusEntry = async (id: string, number: number) =>
        (await items(id)).find((item) => item.field === "status" && item.version === number);

      beforeEach(async () => {
        await db.update(assets).set({ status: "DRAFT" }).where(eq(assets.id, draft));
      });

      it("keeps a draft a draft when it is brought back, also for the GM", async () => {
        await archive(draft, 1, GM);

        const response = await bringBack(draft, 2, GM);

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ status: "DRAFT", version: 3 });
        expect(await statusEntry(draft, 3)).toMatchObject({
          action: "asset.restore",
          value: "DRAFT",
          actorId: ID.gm,
        });
      });

      it("makes an active asset active again", async () => {
        await archive(ID.sharedSpell, 1);

        expect((await bringBack(ID.sharedSpell, 2)).json()).toMatchObject({ status: "ACTIVE" });
      });

      it("makes assets active that were archived before the history", async () => {
        await db.update(assets).set({ status: "ARCHIVED" }).where(eq(assets.id, draft));

        expect((await bringBack(draft, 1)).json()).toMatchObject({ status: "ACTIVE", version: 2 });
      });

      it("records undoing the archiving as an entry and returns to the draft", async () => {
        await archive(draft, 1);

        const archivedEvent = await latestEventId(draft);

        expect((await revert(archivedEvent)).statusCode).toBe(200);

        const [row] = await db.select().from(assets).where(eq(assets.id, draft));

        expect(row).toMatchObject({ status: "DRAFT", version: 3 });
        expect(await statusEntry(draft, 3)).toMatchObject({
          action: "history.revert",
          value: "DRAFT",
          actorId: ID.admin,
          revertsEventId: archivedEvent,
        });
      });

      it("records restoring an old version as an entry and returns to that state", async () => {
        await patch(draft, { expectedVersion: 1, status: "ACTIVE", title: "Secret II" });
        await archive(draft, 2);

        expect((await restore(draft, 1)).statusCode).toBe(200);

        const [row] = await db.select().from(assets).where(eq(assets.id, draft));

        expect(row).toMatchObject({ status: "DRAFT", title: "Secret", version: 4 });
        expect(await statusEntry(draft, 4)).toMatchObject({
          action: "history.restore",
          value: "DRAFT",
          actorId: ID.admin,
          restoredFromVersion: 1,
        });
      });

      it("lets an administrator undo a reset like any other entry", async () => {
        await archive(draft, 1);
        await revert(await latestEventId(draft));

        expect((await revert(await latestEventId(draft))).statusCode).toBe(200);

        const [row] = await db.select().from(assets).where(eq(assets.id, draft));

        expect(row).toMatchObject({ status: "ARCHIVED", version: 4 });
      });
    });

    it("rejects undoing a slug that is taken by now", async () => {
      await patch(ID.sharedSpell, { expectedVersion: 1, slug: "ember-two" });

      const eventId = await latestEventId(ID.sharedSpell);

      await patch(ID.unsharedSpell, { expectedVersion: 1, slug: "ember" });

      expect((await revert(eventId)).statusCode).toBe(409);
    });

    it("rejects undoing only one field when the rest would break the ruleset rules", async () => {
      await patch(ID.systemSpell, { expectedVersion: 1, rulesetPolicy: "NEUTRAL" });

      const partly = await injectAs(ADMIN, {
        method: "POST",
        url: `/api/v1/history/events/${await latestEventId(ID.systemSpell)}/revert`,
        payload: { fields: ["rulesetPolicy"] },
      });

      expect(partly.statusCode).toBe(400);
      expect(await activeRulesets(ID.systemSpell)).toEqual([]);
    });
  });

  describe("permissions", () => {
    it("lets the GM archive, bring back and undo that, and records the GM as actor", async () => {
      const archived = await injectAs(GM, {
        method: "DELETE",
        url: `/api/v1/assets/${ID.sharedSpell}?expectedVersion=1`,
      });

      expect(archived.statusCode).toBe(200);

      const entries = await items(ID.sharedSpell);

      expect(entries.find((item) => item.version === 2)).toMatchObject({
        action: "asset.archive",
        field: "status",
        value: "ARCHIVED",
        actorId: ID.gm,
      });

      const undone = await revert(entries.find((item) => item.version === 2)?.eventId as string, GM);

      expect(undone.statusCode).toBe(200);

      const [row] = await db.select().from(assets).where(eq(assets.id, ID.sharedSpell));

      expect(row).toMatchObject({ status: "ACTIVE", version: 3 });
    });

    it("lets the owner and editors archive campaign assets, not players", async () => {
      const archive = (actor: TestActor) =>
        injectAs(actor, {
          method: "DELETE",
          url: `/api/v1/assets/${ID.sharedSpell}?expectedVersion=1`,
        });

      expect((await archive(PLAYER)).statusCode).toBe(403);
      expect((await archive(OUTSIDER)).statusCode).toBe(404);
      expect((await archive(EDITOR)).statusCode).toBe(200);

      const eventId = await latestEventId(ID.sharedSpell);

      expect((await revert(eventId, PLAYER)).statusCode).toBe(404);
      expect((await revert(eventId, OUTSIDER)).statusCode).toBe(404);
      expect((await revert(eventId, GM)).statusCode).toBe(200);
    });

    it("lets the GM read the history of campaign assets but not undo other changes or restore", async () => {
      await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember II" });

      const eventId = await latestEventId(ID.sharedSpell);

      expect((await history(ID.sharedSpell, GM)).statusCode).toBe(200);
      expect((await revert(eventId, GM)).statusCode).toBe(403);
      expect((await restore(ID.sharedSpell, 1, GM)).statusCode).toBe(403);
    });

    it("shows the history only to people who may change the asset", async () => {
      await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember II" });

      for (const actor of [GM, ADMIN]) {
        expect((await history(ID.sharedSpell, actor)).statusCode).toBe(200);
        expect((await version(ID.sharedSpell, 1, actor)).statusCode).toBe(200);
      }

      // Also a player who sees the shared asset itself, and an editor of the campaign.
      for (const actor of [EDITOR, PLAYER, OUTSIDER]) {
        expect((await history(ID.sharedSpell, actor)).statusCode).toBe(404);
        expect((await version(ID.sharedSpell, 1, actor)).statusCode).toBe(404);
      }
    });

    it("answers with 404 for system assets unless an administrator asks", async () => {
      await patch(ID.systemSpell, { expectedVersion: 1, title: "Light II" });

      expect((await history(ID.systemSpell, GM)).statusCode).toBe(404);
      expect((await history(ID.systemSpell, ADMIN)).statusCode).toBe(200);
    });

    it("ignores a campaign header that points to another campaign", async () => {
      await patch(ID.sharedSpell, { expectedVersion: 1, title: "Ember II" });

      const response = await injectAs(OUTSIDER, {
        method: "GET",
        url: `/api/v1/history/asset/${ID.sharedSpell}`,
        headers: { "x-campaign-id": ID.campaign },
      });

      expect(response.statusCode).toBe(404);
    });

    it("keeps direct changes closed for non-admins and writes no history", async () => {
      for (const actor of [GM, PLAYER, OUTSIDER]) {
        expect((await patch(ID.sharedSpell, { expectedVersion: 1, title: "X" }, actor)).statusCode).toBe(403);
      }

      expect(await items(ID.sharedSpell)).toEqual([]);
    });
  });
});
