import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetLinks,
  assets,
  assetTags,
  campaignMemberships,
  campaigns,
  contentShares,
  notes,
  rulesets,
  tags,
  users,
} from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  otherPlayer: "a0000000-0000-4000-8000-000000000003",
  editor: "a0000000-0000-4000-8000-000000000004",
  outsider: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  admin: "a0000000-0000-4000-8000-000000000007",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  playerMember: "b0000000-0000-4000-8000-000000000002",
  otherPlayerMember: "b0000000-0000-4000-8000-000000000003",
  location: "e0000000-0000-4000-8000-000000000001",
  archivedLocation: "e0000000-0000-4000-8000-000000000002",
  foreignLocation: "e0000000-0000-4000-8000-000000000003",
  tag: "f0000000-0000-4000-8000-000000000001",
  foreignTag: "f0000000-0000-4000-8000-000000000002",
  unknown: "f0000000-0000-4000-8000-00000000000f",
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

type NoteBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  name: string;
  status: string;
  content: string;
  contentHtml: string;
  gmNotes: string | null;
  tagIds: string[];
  merged?: string[];
};

describe("notes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  // A new app per test, because one test can send more requests than one route allows in its window.
  let session: ReturnType<typeof buildTestApp>;

  const notesUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/notes`;

  const create = (payload: Record<string, unknown>, as: TestActor = GM, campaignId?: string) =>
    session.injectAs(as, { method: "POST", url: notesUrl(campaignId), payload });

  const createOk = async (payload: Record<string, unknown> = {}) => {
    const response = await create({
      name: "The Baron's Letter",
      noteType: "HANDOUT",
      content: "Meet me at **midnight**.",
      gmNotes: "The baron lies.",
      ...payload,
    });

    expect(response.statusCode).toBe(201);

    return response.json() as NoteBody;
  };

  const get = (noteId: string, as: TestActor = GM) =>
    session.injectAs(as, { method: "GET", url: `${notesUrl()}/${noteId}` });

  const list = async (as: TestActor, query = "") => {
    const response = await session.injectAs(as, { method: "GET", url: `${notesUrl()}${query}` });

    expect(response.statusCode).toBe(200);

    return response.json() as { data: NoteBody[]; pageInfo: { nextCursor: string | null } };
  };

  const update = (note: NoteBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "PATCH",
      url: `${notesUrl()}/${note.id}`,
      payload: { expectedVersion: note.version, expectedAssetVersion: note.assetVersion, ...payload },
    });

  const remove = (note: NoteBody, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "DELETE",
      url: `${notesUrl()}/${note.id}?expectedAssetVersion=${note.assetVersion}`,
    });

  const restore = (note: NoteBody, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "POST",
      url: `${notesUrl()}/${note.id}/restore`,
      payload: { expectedAssetVersion: note.assetVersion },
    });

  const share = async (assetId: string, payload: Record<string, unknown> = { audience: "ALL_PLAYERS" }) => {
    const response = await session.injectAs(GM, {
      method: "POST",
      url: `/api/v1/campaigns/${ID.campaign}/shares`,
      payload: { assetId, ...payload },
    });

    expect(response.statusCode).toBe(201);

    return response.json() as { id: string };
  };

  const countRows = async () => ({
    assets: (await db.select().from(assets).where(eq(assets.assetType, "NOTE"))).length,
    notes: (await db.select().from(notes)).length,
    tags: (await db.select().from(assetTags)).length,
    links: (await db.select().from(assetLinks)).length,
  });

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "NOTES_MAIN",
      name: "Ruleset",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });
    await db.insert(users).values(
      [ID.gm, ID.player, ID.otherPlayer, ID.editor, ID.outsider, ID.foreignGm, ID.admin].map(
        (id) => ({
          id,
          email: `${id}@example.test`,
          passwordHash: "hash",
          displayName: "User",
          systemRole: id === ID.admin ? ("ADMIN" as const) : ("USER" as const),
          status: "ACTIVE" as const,
          emailVerifiedAt: new Date(),
        }),
      ),
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
      { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      { id: ID.playerMember, campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      {
        id: ID.otherPlayerMember,
        campaignId: ID.campaign,
        userId: ID.otherPlayer,
        role: "PLAYER",
        createdBy: ID.gm,
      },
      { campaignId: ID.foreignCampaign, userId: ID.foreignGm, role: "EDITOR", createdBy: ID.foreignGm },
    ]);

    const own = { scope: "CAMPAIGN", origin: "CUSTOM", campaignId: ID.campaign, status: "ACTIVE" } as const;

    await db.insert(assets).values([
      { ...own, id: ID.location, assetType: "LOCATION", title: "Inn", slug: "inn" },
      {
        ...own,
        id: ID.archivedLocation,
        assetType: "LOCATION",
        title: "Ruin",
        slug: "ruin",
        status: "ARCHIVED",
      },
      {
        ...own,
        campaignId: ID.foreignCampaign,
        id: ID.foreignLocation,
        assetType: "LOCATION",
        title: "Foreign",
        slug: "foreign",
      },
    ]);
    await db.insert(tags).values([
      { id: ID.tag, campaignId: ID.campaign, name: "Clue", normalizedName: "clue" },
      { id: ID.foreignTag, campaignId: ID.foreignCampaign, name: "Clue", normalizedName: "clue" },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("creating", () => {
    it("creates asset, note, tags and links in one go", async () => {
      const note = await createOk({
        summary: "A letter",
        tagIds: [ID.tag],
        relatedLinks: [{ targetAssetId: ID.location, relationType: "RELATED_TO", label: "Where" }],
      });

      expect(note).toMatchObject({
        view: "GM",
        name: "The Baron's Letter",
        summary: "A letter",
        status: "ACTIVE",
        noteType: "HANDOUT",
        contentFormat: "MARKDOWN",
        content: "Meet me at **midnight**.",
        contentHtml: "<p>Meet me at <strong>midnight</strong>.</p>\n",
        gmNotes: "The baron lies.",
        sortOrder: 0,
        tagIds: [ID.tag],
        campaignId: ID.campaign,
      });
      expect(note.id).not.toBe(note.assetId);

      const [asset] = await db.select().from(assets).where(eq(assets.id, note.assetId));

      expect(asset).toMatchObject({
        assetType: "NOTE",
        scope: "CAMPAIGN",
        origin: "CUSTOM",
        rulesetPolicy: "NEUTRAL",
        campaignId: ID.campaign,
      });
      expect(await countRows()).toEqual({ assets: 1, notes: 1, tags: 1, links: 1 });
    });

    it("allows the same name twice", async () => {
      await createOk();
      await createOk();

      expect((await list(GM)).data).toHaveLength(2);
    });

    it("rolls everything back when a tag or link fails", async () => {
      const base = { name: "Letter", noteType: "LORE", content: "Text" };

      expect((await create({ ...base, tagIds: [ID.foreignTag] })).statusCode).toBe(404);
      expect(
        (
          await create({
            ...base,
            tagIds: [ID.tag],
            relatedLinks: [{ targetAssetId: ID.archivedLocation, relationType: "RELATED_TO" }],
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await create({
            ...base,
            relatedLinks: [{ targetAssetId: ID.foreignLocation, relationType: "RELATED_TO" }],
          })
        ).statusCode,
      ).toBe(404);
      expect(await countRows()).toEqual({ assets: 0, notes: 0, tags: 0, links: 0 });
    });

    it("refuses invalid input and oversized content", async () => {
      const base = { name: "Letter", noteType: "LORE", content: "Text" };

      for (const payload of [
        { ...base, noteType: "SECRET" },
        { ...base, name: "" },
        { ...base, content: "a".repeat(100_001) },
        { ...base, campaignId: ID.foreignCampaign },
        { ...base, status: "ARCHIVED" },
      ]) {
        expect({ payload: Object.keys(payload), status: (await create(payload)).statusCode }).toEqual({
          payload: Object.keys(payload),
          status: 400,
        });
      }

      expect(await countRows()).toEqual({ assets: 0, notes: 0, tags: 0, links: 0 });
    });

    it("stores markup as typed and renders it harmless", async () => {
      const content = '<script>alert(1)</script> <img src=x onerror="alert(1)"> [x](javascript:alert(1))';
      const note = await createOk({ content, gmNotes: "Use the javascript: console" });

      expect(note.content).toBe(content);
      expect(note.gmNotes).toBe("Use the javascript: console");
      expect(note.contentHtml).not.toMatch(/<(script|img|a)\b/);
      expect(note.contentHtml).toContain("&lt;script&gt;");

      const [row] = await db.select().from(notes).where(eq(notes.id, note.id));

      expect(row!.content).toBe(content);
    });

    it("keeps SQL in the text as text", async () => {
      const content = "'; DROP TABLE notes; --";
      const note = await createOk({ name: "Robert'); DROP TABLE assets;--", content });

      expect((await get(note.id)).json()).toMatchObject({ content });
      expect(await countRows()).toMatchObject({ assets: 1, notes: 1 });
    });

    it("lets GMs, editors and administrators create, nobody else", async () => {
      const payload = { name: "Letter", noteType: "LORE", content: "Text" };

      expect((await create(payload, PLAYER)).statusCode).toBe(403);
      expect((await create(payload, OUTSIDER)).statusCode).toBe(404);
      expect((await create(payload, FOREIGN_GM)).statusCode).toBe(404);
      expect((await create(payload, EDITOR)).statusCode).toBe(201);
      expect((await create(payload, ADMIN)).statusCode).toBe(201);
      expect(
        (await session.app.inject({ method: "POST", url: notesUrl(), payload })).statusCode,
      ).toBe(401);
    });
  });

  describe("reading", () => {
    it("shows players nothing until a note is shared with them", async () => {
      const note = await createOk();

      expect((await list(PLAYER)).data).toEqual([]);
      expect((await get(note.id, PLAYER)).statusCode).toBe(404);
      expect(
        (await session.injectAs(PLAYER, { method: "GET", url: `${notesUrl()}/${note.id}/usages` }))
          .statusCode,
      ).toBe(404);
    });

    it("shows a shared note in the player view without GM notes, tags or audit data", async () => {
      const note = await createOk({ tagIds: [ID.tag] });
      const { id: shareId } = await share(note.assetId);

      const response = await get(note.id, PLAYER);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        view: "PLAYER",
        id: note.id,
        assetId: note.assetId,
        name: "The Baron's Letter",
        summary: null,
        noteType: "HANDOUT",
        contentFormat: "MARKDOWN",
        content: "Meet me at **midnight**.",
        contentHtml: "<p>Meet me at <strong>midnight</strong>.</p>\n",
      });
      expect((await list(PLAYER)).data.map((item) => item.id)).toEqual([note.id]);

      const content = await session.injectAs(PLAYER, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaign}/shares/${shareId}/content`,
      });

      expect(content.statusCode).toBe(200);
      expect(content.json().content).toEqual(response.json());
      expect(JSON.stringify(content.json())).not.toContain("baron lies");
    });

    it("shows a note shared with one player to that player only", async () => {
      const note = await createOk({ noteType: "PLAYER_SECRET" });

      await share(note.assetId, { audience: "SELECTED_PLAYERS", recipientMemberIds: [ID.playerMember] });

      expect((await get(note.id, PLAYER)).statusCode).toBe(200);
      expect((await get(note.id, OTHER_PLAYER)).statusCode).toBe(404);
      expect((await list(OTHER_PLAYER)).data).toEqual([]);
    });

    it("ends the shares of a note set to draft, so making it active again reveals nothing", async () => {
      const note = await createOk();

      await share(note.assetId);

      const draft = await update(note, { status: "DRAFT" });

      expect(draft.statusCode).toBe(200);
      expect(await db.select().from(contentShares)).toEqual([]);
      expect((await get(note.id, PLAYER)).statusCode).toBe(404);
      expect((await update(draft.json(), { status: "ACTIVE" })).statusCode).toBe(200);
      expect((await get(note.id, PLAYER)).statusCode).toBe(404);
      expect((await list(PLAYER)).data).toEqual([]);
    });

    it("lists notes without their text", async () => {
      const note = await createOk({ tagIds: [ID.tag] });

      await share(note.assetId);

      const [gmItem] = (await list(GM)).data;
      const [playerItem] = (await list(PLAYER)).data;

      expect(gmItem).toMatchObject({ view: "GM", id: note.id, name: note.name, tagIds: [ID.tag] });
      expect(playerItem).toEqual({
        view: "PLAYER",
        id: note.id,
        assetId: note.assetId,
        name: note.name,
        summary: null,
        noteType: "HANDOUT",
        contentFormat: "MARKDOWN",
      });

      for (const item of [gmItem, playerItem]) {
        expect(item).not.toHaveProperty("content");
        expect(item).not.toHaveProperty("contentHtml");
        expect(item).not.toHaveProperty("gmNotes");
      }
    });

    it("ignores the tag filter of players, so tags don't leak", async () => {
      const tagged = await createOk({ name: "Tagged", tagIds: [ID.tag] });
      const untagged = await createOk({ name: "Untagged" });

      await share(tagged.assetId);
      await share(untagged.assetId);

      expect((await list(PLAYER, `?tagId=${ID.tag}`)).data.map((item) => item.id).sort()).toEqual(
        [tagged.id, untagged.id].sort(),
      );
    });

    it("reports notes of other campaigns as missing", async () => {
      const note = await createOk();

      expect((await get(note.id, FOREIGN_GM)).statusCode).toBe(404);
      expect(
        (
          await session.injectAs(GM, {
            method: "GET",
            url: `${notesUrl(ID.foreignCampaign)}/${note.id}`,
          })
        ).statusCode,
      ).toBe(404);
      expect((await get(ID.unknown)).statusCode).toBe(404);
    });

    it("filters and pages the list", async () => {
      const first = await createOk({ name: "Alpha", noteType: "LORE", sortOrder: 1, tagIds: [ID.tag] });
      const second = await createOk({ name: "Beta", noteType: "HANDOUT", sortOrder: 2 });
      const third = await createOk({ name: "Gamma", noteType: "LORE", sortOrder: 3, status: "DRAFT" });

      expect((await list(GM, "?noteType=LORE")).data.map((item) => item.id)).toEqual([
        first.id,
        third.id,
      ]);
      expect((await list(GM, `?tagId=${ID.tag}`)).data.map((item) => item.id)).toEqual([first.id]);
      expect((await list(GM, "?search=bet")).data.map((item) => item.id)).toEqual([second.id]);
      expect((await list(GM, "?status=DRAFT")).data.map((item) => item.id)).toEqual([third.id]);

      const page = await list(GM, "?limit=2");

      expect(page.data.map((item) => item.id)).toEqual([first.id, second.id]);
      expect(
        (await list(GM, `?limit=2&cursor=${page.pageInfo.nextCursor}`)).data.map((item) => item.id),
      ).toEqual([third.id]);
    });
  });

  describe("changing", () => {
    it("changes asset fields, text and tags together", async () => {
      const note = await createOk();
      const response = await update(note, {
        name: "New name",
        content: "Plain < text",
        contentFormat: "PLAIN_TEXT",
        tagIds: [ID.tag],
        gmNotes: null,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        name: "New name",
        content: "Plain < text",
        contentHtml: "<p>Plain &lt; text</p>\n",
        tagIds: [ID.tag],
        gmNotes: null,
        version: note.version + 1,
        merged: [],
      });
      expect(response.json().assetVersion).toBeGreaterThan(note.assetVersion);
    });

    it("merges different fields and refuses the same field changed by somebody else", async () => {
      const note = await createOk();

      expect((await update(note, { content: "First" }, EDITOR)).statusCode).toBe(200);

      const merged = await update(note, { sortOrder: 5 });

      expect(merged.statusCode).toBe(200);
      expect(merged.json()).toMatchObject({ content: "First", sortOrder: 5 });
      expect((await update(note, { content: "Second" })).statusCode).toBe(412);
      expect((await update(note, { name: "Renamed" })).statusCode).toBe(200);
      expect((await update(note, { name: "Again" })).statusCode).toBe(412);
    });

    it("refuses players, strangers, empty changes and other campaigns", async () => {
      const note = await createOk();

      expect((await update(note, { content: "x" }, PLAYER)).statusCode).toBe(403);
      expect((await update(note, { content: "x" }, OUTSIDER)).statusCode).toBe(404);
      expect((await update(note, { content: "x" }, FOREIGN_GM)).statusCode).toBe(404);
      expect((await update(note, {})).statusCode).toBe(400);
      expect(
        (
          await session.injectAs(FOREIGN_GM, {
            method: "PATCH",
            url: `${notesUrl(ID.foreignCampaign)}/${note.id}`,
            payload: { expectedVersion: 1, expectedAssetVersion: 1, content: "x" },
          })
        ).statusCode,
      ).toBe(404);
    });
  });

  describe("deleting", () => {
    it("archives the note, ends its shares and restores it without them", async () => {
      const note = await createOk();

      await share(note.assetId);

      const deleted = await remove(note, EDITOR);

      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ status: "ARCHIVED" });
      expect(await db.select().from(contentShares)).toEqual([]);
      expect((await get(note.id, PLAYER)).statusCode).toBe(404);
      expect((await list(GM)).data).toEqual([]);
      expect((await list(GM, "?status=ARCHIVED")).data.map((item) => item.id)).toEqual([note.id]);
      expect((await update(deleted.json(), { content: "x" })).statusCode).toBe(409);

      const restored = await restore(deleted.json(), EDITOR);

      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({ status: "ACTIVE" });
      expect((await get(note.id, PLAYER)).statusCode).toBe(404);
    });

    it("ends the shares also when the asset is archived elsewhere", async () => {
      const note = await createOk();

      await share(note.assetId);

      const response = await session.injectAs(GM, {
        method: "DELETE",
        url: `/api/v1/assets/${note.assetId}?expectedVersion=${note.assetVersion}`,
      });

      expect(response.statusCode).toBe(200);
      expect(await db.select().from(contentShares)).toEqual([]);
    });

    it("refuses players, stale versions and a second deletion", async () => {
      const note = await createOk();

      expect((await remove(note, PLAYER)).statusCode).toBe(403);
      expect((await remove({ ...note, assetVersion: note.assetVersion + 5 })).statusCode).toBe(412);

      const deleted = (await remove(note)).json() as NoteBody;

      expect((await remove(deleted)).statusCode).toBe(409);
      expect((await restore(note)).statusCode).toBe(412);
    });
  });

  describe("usages and history", () => {
    it("lists incoming links with the edit route of the note", async () => {
      const note = await createOk();
      const other = await createOk({ name: "Other" });

      expect(
        (
          await session.injectAs(GM, {
            method: "POST",
            url: `/api/v1/campaigns/${ID.campaign}/assets/${other.assetId}/links`,
            payload: { targetAssetId: note.assetId, relationType: "RELATED_TO" },
          })
        ).statusCode,
      ).toBe(201);

      const response = await session.injectAs(GM, {
        method: "GET",
        url: `${notesUrl()}/${note.id}/usages`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().incoming).toEqual([
        expect.objectContaining({
          assetId: other.assetId,
          assetType: "NOTE",
          editRoute: `/campaigns/${ID.campaign}/notes/${other.id}`,
        }),
      ]);
    });

    it("records the text for editors and keeps it from players", async () => {
      const note = await createOk();

      await update(note, { content: "Changed" }, EDITOR);
      await share(note.assetId);

      const editorView = await session.injectAs(EDITOR, {
        method: "GET",
        url: `/api/v1/history/note/${note.id}`,
      });

      expect(editorView.statusCode).toBe(200);
      expect(editorView.json().data).toEqual(
        expect.arrayContaining([expect.objectContaining({ field: "content", value: "Changed" })]),
      );
      expect(
        (await session.injectAs(PLAYER, { method: "GET", url: `/api/v1/history/note/${note.id}` }))
          .statusCode,
      ).toBe(404);
    });
  });

  describe("database", () => {
    it("allows one active note per asset and only valid values", async () => {
      const note = await createOk();
      const [row] = await db.select().from(notes).where(eq(notes.id, note.id));
      const copy = { ...row!, id: undefined, version: 1 };

      await expect(db.insert(notes).values(copy)).rejects.toMatchObject({
        cause: expect.objectContaining({ code: "23505" }),
      });
      await expect(
        db.insert(notes).values({ ...copy, deletedAt: null, sortOrder: -1, assetId: ID.location }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
      await expect(
        db.insert(notes).values({ ...copy, assetId: ID.foreignLocation }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23503" }) });
    });
  });
});
