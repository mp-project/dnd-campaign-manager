import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { campaignMemberships, campaigns, rulesets, users } from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  editor: "a0000000-0000-4000-8000-000000000005",
  campaign: "c0000000-0000-4000-8000-00000000000a",
} as const;

const GM: TestActor = { actorId: ID.gm, systemRole: "USER" };
const PLAYER: TestActor = { actorId: ID.player, systemRole: "USER" };
const OUTSIDER: TestActor = { actorId: ID.outsider, systemRole: "USER" };
const ADMIN: TestActor = { actorId: ID.admin, systemRole: "ADMIN" };
const EDITOR: TestActor = { actorId: ID.editor, systemRole: "USER" };

type HistoryItem = {
  eventId: string;
  action: string;
  field: string;
  value: unknown;
  delta: number | null;
  version: number;
  actorId: string | null;
  reason: string | null;
  isBaseline: boolean;
  revertsEventId: string | null;
  restoredFromVersion: number | null;
};

describe("campaigns history", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp();

  beforeEach(async () => {
    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "DND_5E_IT_CAMPAIGN_HISTORY",
      name: "Ruleset",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });
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
    // Inserted directly, like rows that already existed before the history.
    await db.insert(campaigns).values({
      id: ID.campaign,
      ownerUserId: ID.gm,
      rulesetId: ID.ruleset,
      name: "North Reach",
      slug: "north-reach",
      status: "ACTIVE",
      currentGameDay: 10,
      longRestCount: 2,
      createdBy: ID.gm,
    });
    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const url = `/api/v1/campaigns/${ID.campaign}`;

  const patch = (payload: Record<string, unknown>, actor = GM) =>
    injectAs(actor, { method: "PATCH", url, payload });

  const archive = (actor = GM) => injectAs(actor, { method: "DELETE", url });

  const advance = (payload: Record<string, unknown>, actor = GM) =>
    injectAs(actor, { method: "POST", url: `${url}/time/advance`, payload });

  const correct = (payload: Record<string, unknown>, actor = GM) =>
    injectAs(actor, { method: "POST", url: `${url}/time/correct`, payload });

  const history = (actor = GM, query = "") =>
    injectAs(actor, { method: "GET", url: `/api/v1/history/campaign/${ID.campaign}${query}` });

  const revert = (eventId: string, actor = GM) =>
    injectAs(actor, {
      method: "POST",
      url: `/api/v1/history/events/${eventId}/revert`,
      payload: {},
    });

  const restore = (version: number, actor = GM) =>
    injectAs(actor, {
      method: "POST",
      url: `/api/v1/history/campaign/${ID.campaign}/versions/${version}/restore`,
      payload: {},
    });

  async function items(): Promise<HistoryItem[]> {
    return (await history(ADMIN)).json().data as HistoryItem[];
  }

  async function latestEventId(): Promise<string> {
    return (((await items())[0] as HistoryItem).eventId);
  }

  async function row() {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, ID.campaign));

    return campaign;
  }

  describe("content", () => {
    it("records new campaigns from their first version on", async () => {
      const created = await injectAs(GM, {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: { name: "Fresh Start", rulesetId: ID.ruleset },
      });

      expect(created.statusCode).toBe(201);

      const entries = (
        await injectAs(GM, { method: "GET", url: `/api/v1/history/campaign/${created.json().id}` })
      ).json().data as HistoryItem[];

      expect(entries.find((item) => item.field === "name")).toMatchObject({
        action: "campaign.create",
        value: "Fresh Start",
        version: 1,
        actorId: ID.gm,
        isBaseline: true,
      });
    });

    it("merges stale forms per field and rejects a stale change of the same field", async () => {
      await patch({ expectedVersion: 1, name: "North Reach II" });

      const merged = await patch({ expectedVersion: 1, name: "North Reach", description: "Cold" });

      expect(merged.statusCode).toBe(200);
      expect(merged.json()).toMatchObject({
        name: "North Reach II",
        description: "Cold",
        version: 3,
        merged: ["name"],
      });
      expect((await patch({ expectedVersion: 1, name: "Other" })).statusCode).toBe(412);
    });

    it("answers 409 when undoing a slug that is taken by now", async () => {
      await patch({ expectedVersion: 1, slug: "renamed" });

      const eventId = await latestEventId();
      const other = await injectAs(GM, {
        method: "POST",
        url: "/api/v1/campaigns",
        payload: { name: "Other", slug: "north-reach", rulesetId: ID.ruleset },
      });

      expect(other.statusCode).toBe(201);
      expect((await revert(eventId)).statusCode).toBe(409);
    });
  });

  describe("campaign time", () => {
    it("records advancing with deltas and the reason", async () => {
      const response = await advance({ days: 3, longRests: 1, reason: "Downtime" });

      expect(response.json()).toMatchObject({ currentGameDay: 13, longRestCount: 3, version: 2 });

      const entries = (await items()).filter((item) => item.version === 2);

      expect(entries).toHaveLength(2);
      expect(entries.find((item) => item.field === "currentGameDay")).toMatchObject({
        action: "campaign.advanceTime",
        value: 13,
        delta: 3,
        reason: "Downtime",
        actorId: ID.gm,
      });
      expect(entries.find((item) => item.field === "longRestCount")).toMatchObject({
        value: 3,
        delta: 1,
      });
    });

    it("adds up parallel requests instead of losing or rejecting one", async () => {
      const responses = await Promise.all([
        advance({ days: 1 }),
        advance({ days: 1 }),
        advance({ days: 1 }),
      ]);

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200]);
      expect(await row()).toMatchObject({ currentGameDay: 13, version: 4 });
    });

    it("records a correction and undoes it by its delta, keeping later days", async () => {
      await correct({ gameDay: 4, longRestCount: 1, reason: "Session log" });

      const eventId = await latestEventId();

      await advance({ days: 2 });

      expect((await row())?.currentGameDay).toBe(6);
      expect((await revert(eventId)).statusCode).toBe(200);
      expect(await row()).toMatchObject({ currentGameDay: 12, longRestCount: 2 });
    });

    it("never undoes below zero", async () => {
      await correct({ gameDay: 20, longRestCount: 2, reason: "Jump" });

      const eventId = await latestEventId();

      await correct({ gameDay: 0, longRestCount: 2, reason: "Reset" });

      expect((await revert(eventId)).statusCode).toBe(200);
      expect((await row())?.currentGameDay).toBe(0);
    });
  });

  describe("archiving and resetting", () => {
    it("brings back the status and records that as an entry", async () => {
      await db.update(campaigns).set({ status: "DRAFT" }).where(eq(campaigns.id, ID.campaign));

      expect((await archive()).statusCode).toBe(204);

      const archived = await latestEventId();

      expect((await advance({ days: 1 })).statusCode).toBe(409);
      expect((await revert(archived)).statusCode).toBe(200);
      expect(await row()).toMatchObject({ status: "DRAFT", version: 3 });
      expect((await items())[0]).toMatchObject({
        action: "history.revert",
        field: "status",
        value: "DRAFT",
        revertsEventId: archived,
      });
    });

    it("writes no entry when archiving twice", async () => {
      await archive();

      const { version } = (await row()) as { version: number };

      expect((await archive()).statusCode).toBe(204);
      expect((await row())?.version).toBe(version);
    });

    it("restores an old version including time and records it as an entry", async () => {
      await patch({ expectedVersion: 1, name: "North Reach II" });
      await advance({ days: 5 });
      await archive();

      expect((await restore(1)).statusCode).toBe(200);
      expect(await row()).toMatchObject({
        name: "North Reach",
        status: "ACTIVE",
        currentGameDay: 10,
        version: 5,
      });
      expect((await items()).find((item) => item.field === "status")).toMatchObject({
        action: "history.restore",
        restoredFromVersion: 1,
      });
    });
  });

  describe("permissions", () => {
    it("shows the history only to people who may change the campaign", async () => {
      await advance({ days: 1, reason: "Rest" });

      for (const actor of [GM, ADMIN]) {
        expect((await history(actor)).statusCode).toBe(200);
      }

      for (const actor of [EDITOR, PLAYER, OUTSIDER]) {
        expect((await history(actor)).statusCode).toBe(404);
      }
    });

    it("lets only the GM and administrators undo and restore", async () => {
      await patch({ expectedVersion: 1, name: "North Reach II" });

      const eventId = await latestEventId();

      for (const actor of [EDITOR, PLAYER, OUTSIDER]) {
        expect((await revert(eventId, actor)).statusCode).toBe(404);
        expect((await restore(1, actor)).statusCode).toBe(404);
      }

      expect((await revert(eventId, ADMIN)).statusCode).toBe(200);
      expect((await row())?.name).toBe("North Reach");
    });

    it("keeps direct changes to the GM and writes no entries otherwise", async () => {
      for (const actor of [EDITOR, PLAYER, OUTSIDER]) {
        expect((await patch({ expectedVersion: 1, name: "X" }, actor)).statusCode).toBe(404);
        expect((await advance({ days: 1 }, actor)).statusCode).toBe(404);
        expect((await correct({ gameDay: 1, longRestCount: 1, reason: "X" }, actor)).statusCode).toBe(404);
        expect((await archive(actor)).statusCode).toBe(404);
      }

      expect(await items()).toEqual([]);
    });
  });
});
