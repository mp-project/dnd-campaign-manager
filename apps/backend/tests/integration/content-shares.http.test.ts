import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { AppModule } from "#core/app/moduleSystem";
import { ConflictError } from "#core/error/http/index";
import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetRulesets,
  assets,
  campaignMemberships,
  campaigns,
  contentShareRecipients,
  contentShares,
  rulesets,
  users,
} from "#core/db/schema";
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
  ruleset: "10000000-0000-4000-8000-000000002024",
  otherRuleset: "10000000-0000-4000-8000-000000002014",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  otherPlayer: "a0000000-0000-4000-8000-000000000003",
  editor: "a0000000-0000-4000-8000-000000000004",
  outsider: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  foreignPlayer: "a0000000-0000-4000-8000-000000000007",
  admin: "a0000000-0000-4000-8000-000000000008",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  playerMember: "b0000000-0000-4000-8000-000000000002",
  otherPlayerMember: "b0000000-0000-4000-8000-000000000003",
  editorMember: "b0000000-0000-4000-8000-000000000004",
  foreignPlayerMember: "b0000000-0000-4000-8000-000000000007",
  note: "e0000000-0000-4000-8000-000000000001",
  secondNote: "e0000000-0000-4000-8000-000000000002",
  draftNote: "e0000000-0000-4000-8000-000000000003",
  location: "e0000000-0000-4000-8000-000000000004",
  lockedLocation: "e0000000-0000-4000-8000-000000000005",
  npc: "e0000000-0000-4000-8000-000000000006",
  foreignNote: "e0000000-0000-4000-8000-000000000007",
  globalNote: "e0000000-0000-4000-8000-000000000008",
  unknown: "e0000000-0000-4000-8000-00000000000f",
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
const FOREIGN_GM = actor(ID.foreignGm);
const ADMIN = actor(ID.admin, "ADMIN");

/** Stands in for the modules that own quests and locations; NPCs stay unshareable. */
const shareableModule: AppModule = {
  name: "test-shareable-types",
  dependencies: ["assets"],
  register: (_app, container) => {
    const { service } = container.dependencies.require<AssetsModuleDependencies>(
      ASSETS_MODULE_DEPENDENCIES,
    );

    // Loads more than players may see; the schema decides what leaves the server.
    service.registerContentType({
      assetType: "QUEST",
      kind: "STORY",
      editRoutes: () => new Map(),
      playerView: {
        schema: z.object({ title: z.string(), content: z.string() }),
        load: async ({ assetId }) => ({
          title: assetId === ID.globalNote ? "Rules" : "Note",
          content: `Content of ${assetId}`,
          gmNotes: "The baron lies",
        }),
      },
    });
    service.registerContentType({
      assetType: "LOCATION",
      kind: "STORY",
      editRoutes: () => new Map(),
      assertShareable: async (asset) => {
        if (asset.title === "Locked") {
          throw new ConflictError("This location is not ready to be shared");
        }
      },
      // Strict: a module that returns more than it declares fails instead of leaking it.
      playerView: {
        schema: z.strictObject({ name: z.string() }),
        load: async () => ({ name: "Inn", secretExit: "Cellar" }),
      },
    });
  },
};

type ShareBody = {
  id: string;
  version: number;
  audience: string;
  recipientMemberIds: string[];
  sharedAt: string;
  expiresAt: string | null;
};

describe("content shares", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  // A new app per test, because one test can send more requests than one route allows in its window.
  let session: ReturnType<typeof buildTestApp>;

  const sharesUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/shares`;

  const share = (payload: Record<string, unknown>, as: TestActor = GM, campaignId?: string) =>
    session.injectAs(as, { method: "POST", url: sharesUrl(campaignId), payload });

  const shareOk = async (payload: Record<string, unknown>) => {
    const response = await share(payload);

    expect(response.statusCode).toBe(201);

    return response.json() as ShareBody;
  };

  const shareToAll = (assetId: string = ID.note) => shareOk({ assetId, audience: "ALL_PLAYERS" });

  const shareTo = (memberIds: string[], assetId: string = ID.note) =>
    shareOk({ assetId, audience: "SELECTED_PLAYERS", recipientMemberIds: memberIds });

  const patch = (id: string, payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, { method: "PATCH", url: `${sharesUrl()}/${id}`, payload });

  const revoke = (id: string, as: TestActor = GM) =>
    session.injectAs(as, { method: "DELETE", url: `${sharesUrl()}/${id}` });

  const list = async (as: TestActor, query = "") => {
    const response = await session.injectAs(as, { method: "GET", url: `${sharesUrl()}${query}` });

    expect(response.statusCode).toBe(200);

    return response.json() as { data: Record<string, unknown>[]; pageInfo: { nextCursor: string | null } };
  };

  /** What a player sees through the asset module, which asks every visibility provider. */
  const visibleAssets = async (as: TestActor) => {
    const response = await session.injectAs(as, {
      method: "GET",
      url: `/api/v1/campaigns/${ID.campaign}/assets`,
    });

    expect(response.statusCode).toBe(200);

    return (response.json().data as { id: string }[]).map((item) => item.id).sort();
  };

  const expire = async (shareId: string) => {
    await db
      .update(contentShares)
      .set({
        createdAt: sql`now() - interval '2 hours'`,
        expiresAt: sql`now() - interval '1 hour'`,
      })
      .where(eq(contentShares.id, shareId));
  };

  beforeEach(async () => {
    session = buildTestApp({ modules: [...defaultAppModules, shareableModule] });

    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "SHARES_MAIN",
      name: "Ruleset",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });
    await db.insert(users).values(
      [
        ID.gm,
        ID.player,
        ID.otherPlayer,
        ID.editor,
        ID.outsider,
        ID.foreignGm,
        ID.foreignPlayer,
        ID.admin,
      ].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "User",
        systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );
    await db.insert(campaigns).values(
      [
        { id: ID.campaign, ownerUserId: ID.gm, slug: "own" },
        { id: ID.foreignCampaign, ownerUserId: ID.foreignGm, slug: "foreign" },
      ].map((campaign) => ({
        ...campaign,
        rulesetId: ID.ruleset,
        name: "Campaign",
        status: "ACTIVE" as const,
        createdBy: campaign.ownerUserId,
      })),
    );
    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      { id: ID.editorMember, campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      { id: ID.playerMember, campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      {
        id: ID.otherPlayerMember,
        campaignId: ID.campaign,
        userId: ID.otherPlayer,
        role: "PLAYER",
        createdBy: ID.gm,
      },
      {
        campaignId: ID.foreignCampaign,
        userId: ID.foreignGm,
        role: "EDITOR",
        createdBy: ID.foreignGm,
      },
      {
        id: ID.foreignPlayerMember,
        campaignId: ID.foreignCampaign,
        userId: ID.foreignPlayer,
        role: "PLAYER",
        createdBy: ID.foreignGm,
      },
    ]);

    const own = { scope: "CAMPAIGN", origin: "CUSTOM", campaignId: ID.campaign, status: "ACTIVE" } as const;

    await db.insert(assets).values([
      { ...own, id: ID.note, assetType: "QUEST", title: "Letter", slug: "letter" },
      { ...own, id: ID.secondNote, assetType: "QUEST", title: "Map", slug: "map" },
      { ...own, id: ID.draftNote, assetType: "QUEST", title: "Draft", slug: "draft", status: "DRAFT" },
      { ...own, id: ID.location, assetType: "LOCATION", title: "Inn", slug: "inn" },
      { ...own, id: ID.lockedLocation, assetType: "LOCATION", title: "Locked", slug: "locked" },
      { ...own, id: ID.npc, assetType: "NPC", title: "Spy", slug: "spy" },
      {
        scope: "SYSTEM",
        origin: "DEFAULT",
        campaignId: null,
        status: "ACTIVE",
        id: ID.globalNote,
        assetType: "QUEST",
        title: "Rules",
        slug: "rules",
      },
      {
        ...own,
        campaignId: ID.foreignCampaign,
        id: ID.foreignNote,
        assetType: "QUEST",
        title: "Foreign",
        slug: "foreign",
      },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("sharing", () => {
    it("shows players nothing until something is shared with them", async () => {
      expect(await visibleAssets(PLAYER)).toEqual([]);
      expect((await list(PLAYER)).data).toEqual([]);
    });

    it("shares with all players", async () => {
      const created = await shareToAll();

      expect(created).toMatchObject({
        view: "FULL",
        audience: "ALL_PLAYERS",
        recipientMemberIds: [],
        expiresAt: null,
        asset: { id: ID.note, title: "Letter", status: "ACTIVE" },
      });
      expect(await visibleAssets(PLAYER)).toEqual([ID.note]);
      expect(await visibleAssets(OTHER_PLAYER)).toEqual([ID.note]);
    });

    it("shares with selected players only", async () => {
      await shareTo([ID.playerMember]);

      expect(await visibleAssets(PLAYER)).toEqual([ID.note]);
      expect(await visibleAssets(OTHER_PLAYER)).toEqual([]);
    });

    it("shares exactly the asset and nothing that belongs to it", async () => {
      await shareToAll(ID.note);

      expect(await visibleAssets(PLAYER)).not.toContain(ID.secondNote);
    });

    it("allows one share per asset", async () => {
      await shareToAll();

      expect((await share({ assetId: ID.note, audience: "ALL_PLAYERS" })).statusCode).toBe(409);
    });

    it("lets editors and administrators share, but not players or strangers", async () => {
      const payload = { assetId: ID.note, audience: "ALL_PLAYERS" };

      expect((await share(payload, PLAYER)).statusCode).toBe(403);
      expect((await share(payload, OUTSIDER)).statusCode).toBe(404);
      expect((await share(payload, FOREIGN_GM)).statusCode).toBe(404);
      expect((await share(payload, EDITOR)).statusCode).toBe(201);
      expect((await share({ ...payload, assetId: ID.secondNote }, ADMIN)).statusCode).toBe(201);
    });

    it("answers 401 without a login", async () => {
      expect((await session.app.inject({ method: "GET", url: sharesUrl() })).statusCode).toBe(401);
    });

    it("refuses invalid input", async () => {
      expect((await share({ assetId: ID.note, audience: "SELECTED_PLAYERS" })).statusCode).toBe(400);
      expect(
        (await share({ assetId: ID.note, audience: "ALL_PLAYERS", recipientMemberIds: [ID.playerMember] }))
          .statusCode,
      ).toBe(400);
      expect(
        (await share({ assetId: ID.note, audience: "ALL_PLAYERS", expiresAt: "2000-01-01T00:00:00.000Z" }))
          .statusCode,
      ).toBe(400);
      expect((await share({ assetId: ID.note, audience: "ALL_PLAYERS", campaignId: ID.foreignCampaign })).statusCode).toBe(400);
    });

    it("only takes active players of the campaign as recipients", async () => {
      for (const memberId of [ID.editorMember, ID.foreignPlayerMember, ID.unknown]) {
        const refused = await share({
          assetId: ID.note,
          audience: "SELECTED_PLAYERS",
          recipientMemberIds: [ID.playerMember, memberId],
        });

        expect(refused.statusCode).toBe(409);
        expect(refused.json().error.details).toEqual({ recipientMemberIds: [memberId] });
      }

      expect(await db.select().from(contentShares)).toEqual([]);
    });

    it("refuses content of other campaigns and unknown content", async () => {
      expect((await share({ assetId: ID.foreignNote, audience: "ALL_PLAYERS" })).statusCode).toBe(404);
      expect((await share({ assetId: ID.unknown, audience: "ALL_PLAYERS" })).statusCode).toBe(404);
    });

    it("shares global content to draw attention to it, separately per campaign", async () => {
      const created = await shareTo([ID.playerMember], ID.globalNote);

      expect(created).toMatchObject({ assetId: ID.globalNote, asset: { title: "Rules" } });
      expect((await list(PLAYER)).data.map((item) => item.assetId)).toEqual([ID.globalNote]);
      expect((await list(OTHER_PLAYER)).data).toEqual([]);
      expect(
        (await share({ assetId: ID.globalNote, audience: "ALL_PLAYERS" }, FOREIGN_GM, ID.foreignCampaign))
          .statusCode,
      ).toBe(201);
      expect((await share({ assetId: ID.globalNote, audience: "ALL_PLAYERS" })).statusCode).toBe(409);
    });

    it("refuses global content that does not fit the ruleset of the campaign", async () => {
      await db.insert(rulesets).values({
        id: ID.otherRuleset,
        code: "SHARES_OTHER",
        name: "Other",
        status: "ACTIVE",
        editionYear: 2014,
        sourceReference: {},
        licenseCode: "TEST",
      });
      await db
        .update(assets)
        .set({ rulesetPolicy: "RESTRICTED" })
        .where(eq(assets.id, ID.globalNote));
      await db.insert(assetRulesets).values({ assetId: ID.globalNote, rulesetId: ID.otherRuleset });

      expect((await share({ assetId: ID.globalNote, audience: "ALL_PLAYERS" })).statusCode).toBe(409);
    });

    it("shares several contents at the same time", async () => {
      const responses = await Promise.all(
        [ID.note, ID.secondNote, ID.location].map((assetId) =>
          share({ assetId, audience: "SELECTED_PLAYERS", recipientMemberIds: [ID.playerMember] }),
        ),
      );

      expect(responses.map((response) => response.statusCode)).toEqual([201, 201, 201]);
      expect(await visibleAssets(PLAYER)).toEqual([ID.note, ID.secondNote, ID.location].sort());
      expect((await list(PLAYER)).data).toHaveLength(3);
    });

    it("lets only one of two parallel shares of the same content through", async () => {
      const responses = await Promise.all([
        share({ assetId: ID.note, audience: "ALL_PLAYERS" }),
        share({ assetId: ID.note, audience: "SELECTED_PLAYERS", recipientMemberIds: [ID.playerMember] }),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
      expect(await db.select().from(contentShares)).toHaveLength(1);
    });
  });

  describe("what the modules decide", () => {
    it("refuses content types that no module made shareable", async () => {
      const refused = await share({ assetId: ID.npc, audience: "ALL_PLAYERS" });

      expect(refused.statusCode).toBe(409);
      expect(refused.json().error.details).toEqual({ assetType: "NPC" });
    });

    it("lets the module refuse a single asset", async () => {
      expect((await share({ assetId: ID.location, audience: "ALL_PLAYERS" })).statusCode).toBe(201);
      expect((await share({ assetId: ID.lockedLocation, audience: "ALL_PLAYERS" })).statusCode).toBe(409);
    });

    it("refuses drafts and grants nothing for content that is archived later", async () => {
      expect((await share({ assetId: ID.draftNote, audience: "ALL_PLAYERS" })).statusCode).toBe(409);

      await shareToAll();
      await db.update(assets).set({ status: "ARCHIVED" }).where(eq(assets.id, ID.note));

      expect(await visibleAssets(PLAYER)).toEqual([]);
      expect((await list(PLAYER)).data).toEqual([]);
    });

    it("grants nothing for a type that is not shareable, even with a share on record", async () => {
      await db.insert(contentShares).values({
        campaignId: ID.campaign,
        assetId: ID.npc,
        audience: "ALL_PLAYERS",
        createdBy: ID.gm,
      });

      expect(await visibleAssets(PLAYER)).toEqual([]);
      expect((await list(PLAYER)).data).toEqual([]);
    });
  });

  describe("changing and ending", () => {
    it("switches between all and selected players", async () => {
      const created = await shareToAll();
      const selected = await patch(created.id, {
        audience: "SELECTED_PLAYERS",
        recipientMemberIds: [ID.otherPlayerMember],
        expectedVersion: created.version,
      });

      expect(selected.statusCode).toBe(200);
      expect(selected.json()).toMatchObject({
        audience: "SELECTED_PLAYERS",
        recipientMemberIds: [ID.otherPlayerMember],
        version: 2,
      });
      expect(await visibleAssets(PLAYER)).toEqual([]);
      expect(await visibleAssets(OTHER_PLAYER)).toEqual([ID.note]);

      const all = await patch(created.id, { audience: "ALL_PLAYERS", expectedVersion: 2 });

      expect(all.json()).toMatchObject({ audience: "ALL_PLAYERS", recipientMemberIds: [] });
      expect(await db.select().from(contentShareRecipients)).toEqual([]);
    });

    it("checks audience and recipients together with what is stored", async () => {
      const created = await shareTo([ID.playerMember]);

      expect((await patch(created.id, { audience: "ALL_PLAYERS", recipientMemberIds: [ID.playerMember], expectedVersion: 1 })).statusCode).toBe(400);
      expect((await patch(created.id, { recipientMemberIds: [], expectedVersion: 1 })).statusCode).toBe(400);
      expect((await patch(created.id, { audience: "SELECTED_PLAYERS", expectedVersion: 1 })).statusCode).toBe(200);
    });

    it("changes recipients without revealing the content again to those who stay", async () => {
      const created = await shareTo([ID.playerMember]);
      const [before] = await db.select().from(contentShareRecipients);

      await patch(created.id, {
        recipientMemberIds: [ID.playerMember, ID.otherPlayerMember],
        expectedVersion: 1,
      });

      const rows = await db.select().from(contentShareRecipients);

      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.campaignMembershipId === ID.playerMember)).toEqual(before);
    });

    it("sets and removes an end, refusing one in the past", async () => {
      const created = await shareToAll();
      const end = new Date(Date.now() + 3_600_000).toISOString();

      expect((await patch(created.id, { expiresAt: end, expectedVersion: 1 })).json().expiresAt).toBe(end);
      expect((await patch(created.id, { expiresAt: null, expectedVersion: 2 })).json().expiresAt).toBeNull();
      expect(
        (await patch(created.id, { expiresAt: "2000-01-01T00:00:00.000Z", expectedVersion: 3 })).statusCode,
      ).toBe(400);
    });

    it("answers 412 for an old version", async () => {
      const created = await shareToAll();

      await patch(created.id, { expiresAt: null, expectedVersion: 1 });

      expect((await patch(created.id, { expiresAt: null, expectedVersion: 1 })).statusCode).toBe(412);
    });

    it("lets only one of two parallel changes with the same version through", async () => {
      const created = await shareTo([ID.playerMember]);
      const responses = await Promise.all([
        patch(created.id, { recipientMemberIds: [ID.otherPlayerMember], expectedVersion: 1 }),
        patch(created.id, { audience: "ALL_PLAYERS", recipientMemberIds: [], expectedVersion: 1 }),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 412]);

      const [row] = await db.select().from(contentShares);
      const recipients = await db.select().from(contentShareRecipients);

      // The recipients belong to the change that won.
      expect(recipients.length === 0).toBe(row!.audience === "ALL_PLAYERS");
    });

    it("answers one of two parallel revokes with 404", async () => {
      const created = await shareToAll();
      const responses = await Promise.all([revoke(created.id), revoke(created.id)]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([204, 404]);
    });

    it("deletes a revoked share at once, with its recipients, and the content stays", async () => {
      const created = await shareTo([ID.playerMember]);

      expect((await revoke(created.id, PLAYER)).statusCode).toBe(403);
      expect((await revoke(created.id)).statusCode).toBe(204);
      expect(await db.select().from(contentShares)).toEqual([]);
      expect(await db.select().from(contentShareRecipients)).toEqual([]);
      expect(await visibleAssets(PLAYER)).toEqual([]);
      expect((await db.select().from(assets).where(eq(assets.id, ID.note)))[0]!.status).toBe("ACTIVE");
      expect((await revoke(created.id)).statusCode).toBe(404);
      expect((await revoke(created.id, OUTSIDER)).statusCode).toBe(404);

      // The content can be shared again afterwards.
      await shareToAll();
    });

    it("hides an expired share at once and deletes it at the next change", async () => {
      const created = await shareToAll();

      await expire(created.id);

      // Reading as a player hides it without writing anything.
      expect(await visibleAssets(PLAYER)).toEqual([]);
      expect(await db.select().from(contentShares)).toHaveLength(1);
      expect((await patch(created.id, { expiresAt: null, expectedVersion: 1 })).statusCode).toBe(404);
      expect(await db.select().from(contentShares)).toEqual([]);
      expect((await list(GM)).data).toEqual([]);

      await shareToAll();
    });

    it("does not reach shares through another campaign", async () => {
      const created = await shareToAll();
      const url = `${sharesUrl(ID.foreignCampaign)}/${created.id}`;

      expect((await session.injectAs(FOREIGN_GM, { method: "GET", url })).statusCode).toBe(404);
      expect(
        (await session.injectAs(FOREIGN_GM, { method: "PATCH", url, payload: { expiresAt: null, expectedVersion: 1 } }))
          .statusCode,
      ).toBe(404);
      expect((await session.injectAs(FOREIGN_GM, { method: "DELETE", url })).statusCode).toBe(404);
    });

    it("leaves nothing behind when a change fails halfway", async () => {
      const created = await shareTo([ID.playerMember]);

      await db.execute(sql.raw(`
        create function share_test_fail() returns trigger language plpgsql as
          $$ begin raise exception 'test failure'; end; $$;
        create trigger share_test_fail before insert on content_share_recipients
          for each row execute function share_test_fail();
      `));

      const failed = await patch(created.id, {
        audience: "SELECTED_PLAYERS",
        recipientMemberIds: [ID.otherPlayerMember],
        expectedVersion: 1,
      });

      expect(failed.statusCode).toBe(500);

      const [row] = await db.select().from(contentShares);
      const recipients = await db.select().from(contentShareRecipients);

      expect(row!.version).toBe(1);
      expect(recipients.map((item) => item.campaignMembershipId)).toEqual([ID.playerMember]);
    });
  });

  describe("what players see of a share", () => {
    it("lists received shares without other recipients, and editors see everything", async () => {
      const selected = await shareTo([ID.playerMember, ID.otherPlayerMember]);

      await shareToAll(ID.secondNote);

      const own = await list(PLAYER);

      expect(own.data).toHaveLength(2);
      expect(own.data[0]).toEqual({
        view: "PLAYER",
        id: expect.any(String),
        assetId: expect.any(String),
        expiresAt: null,
        revealedAt: expect.any(String),
        asset: { id: expect.any(String), assetType: "QUEST", title: expect.any(String) },
      });
      expect(JSON.stringify(own)).not.toContain(ID.otherPlayerMember);

      const all = await list(GM);

      const listed = all.data.find((item) => item.id === selected.id)!;

      expect(listed.view).toBe("FULL");
      expect([...(listed.recipientMemberIds as string[])].sort()).toEqual([
        ID.playerMember,
        ID.otherPlayerMember,
      ]);
    });

    it("finds only what is new since a point in time, for the popup", async () => {
      await shareToAll();

      const seen = new Date().toISOString();

      expect((await list(PLAYER, `?since=${seen}`)).data).toEqual([]);

      await shareTo([ID.playerMember], ID.secondNote);

      const fresh = await list(PLAYER, `?since=${seen}`);

      expect(fresh.data.map((item) => item.assetId)).toEqual([ID.secondNote]);
      expect((await list(OTHER_PLAYER, `?since=${seen}`)).data).toEqual([]);
    });

    it("pages without losing shares revealed in the same millisecond", async () => {
      for (const assetId of [ID.note, ID.secondNote, ID.location]) {
        await shareToAll(assetId);
      }

      await db.execute(sql`update content_shares set shared_at = '2026-01-01T00:00:00.123456Z'`);

      for (const as of [PLAYER, GM]) {
        const seen: unknown[] = [];
        let cursor: string | null = "";

        while (cursor !== null) {
          const page = await list(as, `?limit=1${cursor ? `&cursor=${cursor}` : ""}`);

          seen.push(...page.data.map((item) => item.assetId));
          cursor = page.pageInfo.nextCursor;
        }

        expect(seen.sort()).toEqual([ID.note, ID.secondNote, ID.location].sort());
      }
    });

    it("pages newest first", async () => {
      await shareToAll(ID.note);
      await shareToAll(ID.secondNote);
      await shareToAll(ID.location);

      for (const as of [PLAYER, GM]) {
        const first = await list(as, "?limit=2");
        const second = await list(as, `?limit=2&cursor=${first.pageInfo.nextCursor}`);

        expect(first.data.map((item) => item.assetId)).toEqual([ID.location, ID.secondNote]);
        expect(second.data.map((item) => item.assetId)).toEqual([ID.note]);
        expect(second.pageInfo.nextCursor).toBeNull();
      }

      expect((await session.injectAs(GM, { method: "GET", url: `${sharesUrl()}?cursor=bad` })).statusCode).toBe(400);
    });

    it("answers 404 to a player for a share that does not reach them", async () => {
      const created = await shareTo([ID.otherPlayerMember]);
      const url = `${sharesUrl()}/${created.id}`;

      expect((await session.injectAs(PLAYER, { method: "GET", url })).statusCode).toBe(404);

      const theirs = await session.injectAs(OTHER_PLAYER, { method: "GET", url });

      expect(theirs.statusCode).toBe(200);
      expect(theirs.json().view).toBe("PLAYER");
    });

    it("ends access when the membership ends", async () => {
      const created = await shareTo([ID.playerMember]);

      await shareToAll(ID.secondNote);
      await db
        .update(campaignMemberships)
        .set({ status: "REVOKED", revokedAt: new Date(), revokedBy: ID.gm })
        .where(eq(campaignMemberships.id, ID.playerMember));

      const response = await session.injectAs(PLAYER, { method: "GET", url: sharesUrl() });

      expect(response.statusCode).toBe(404);

      const all = await list(GM);

      expect(all.data.find((item) => item.id === created.id)).toMatchObject({ recipientMemberIds: [] });
    });

    it("tells players about shares in the usages only when the share reaches them", async () => {
      await shareTo([ID.otherPlayerMember]);

      const usages = (as: TestActor) =>
        session.injectAs(as, {
          method: "GET",
          url: `/api/v1/campaigns/${ID.campaign}/assets/${ID.note}/usages`,
        });

      expect((await usages(GM)).json().shares).toEqual([
        expect.objectContaining({ type: "CONTENT_SHARE", label: "SELECTED_PLAYERS", assetId: ID.note }),
      ]);
      expect((await usages(PLAYER)).statusCode).toBe(404);
      expect((await usages(OTHER_PLAYER)).json().shares).toEqual([
        expect.objectContaining({ type: "CONTENT_SHARE", label: null, editRoute: null }),
      ]);
    });
  });

  describe("loading the shared content", () => {
    const content = (shareId: string, as: TestActor) =>
      session.injectAs(as, { method: "GET", url: `${sharesUrl()}/${shareId}/content` });

    it("gives the player the content as the owning module shows it", async () => {
      const created = await shareTo([ID.playerMember]);
      const response = await content(created.id, PLAYER);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        shareId: created.id,
        assetId: ID.note,
        assetType: "QUEST",
        title: "Letter",
        content: { title: "Note", content: `Content of ${ID.note}` },
      });
      expect(response.body).not.toContain("baron");
    });

    it("works for global content as well", async () => {
      const created = await shareToAll(ID.globalNote);

      expect((await content(created.id, PLAYER)).json()).toMatchObject({
        assetType: "QUEST",
        content: { title: "Rules" },
      });
    });

    it("gives editors the same view as a preview", async () => {
      const created = await shareTo([ID.playerMember]);
      const response = await content(created.id, EDITOR);

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain("baron");
    });

    it("answers 404 when the share does not reach the player or has ended", async () => {
      const created = await shareTo([ID.playerMember]);

      expect((await content(created.id, OTHER_PLAYER)).statusCode).toBe(404);
      expect((await content(created.id, OUTSIDER)).statusCode).toBe(404);
      expect((await content(ID.unknown, PLAYER)).statusCode).toBe(404);

      await expire(created.id);

      expect((await content(created.id, PLAYER)).statusCode).toBe(404);
    });

    it("refuses to answer when a module returns more than it declared", async () => {
      const created = await shareToAll(ID.location);
      const response = await content(created.id, PLAYER);

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain("Cellar");
    });
  });

  describe("constraints of the database", () => {
    it("refuses a second share of one asset per campaign and an unknown asset", async () => {
      const values = { campaignId: ID.campaign, assetId: ID.note, audience: "ALL_PLAYERS" as const, createdBy: ID.gm };

      await db.insert(contentShares).values(values);

      await expect(db.insert(contentShares).values(values)).rejects.toThrow();
      await expect(
        db.insert(contentShares).values({ ...values, assetId: ID.unknown }),
      ).rejects.toThrow();
    });

    it("refuses an end before the start and a recipient twice", async () => {
      await expect(
        db.insert(contentShares).values({
          campaignId: ID.campaign,
          assetId: ID.note,
          audience: "ALL_PLAYERS",
          createdBy: ID.gm,
          expiresAt: new Date("2000-01-01T00:00:00Z"),
        }),
      ).rejects.toThrow();

      const [row] = await db
        .insert(contentShares)
        .values({ campaignId: ID.campaign, assetId: ID.note, audience: "SELECTED_PLAYERS", createdBy: ID.gm })
        .returning();
      const recipient = { contentShareId: row!.id, campaignMembershipId: ID.playerMember, createdBy: ID.gm };

      await db.insert(contentShareRecipients).values(recipient);

      await expect(db.insert(contentShareRecipients).values(recipient)).rejects.toThrow();
    });
  });
});
