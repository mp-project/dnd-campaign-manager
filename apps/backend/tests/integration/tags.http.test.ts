import { and, eq, isNull } from "drizzle-orm";

import type { AppModule } from "#core/app/moduleSystem";
import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetTags,
  assets,
  campaignMemberships,
  campaigns,
  entityChangeEvents,
  rulesets,
  tags,
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
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  editor: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  shared: "e0000000-0000-4000-8000-000000000001",
  hidden: "e0000000-0000-4000-8000-000000000002",
  archived: "e0000000-0000-4000-8000-000000000003",
  sharedArchived: "e0000000-0000-4000-8000-000000000004",
  foreignAsset: "e0000000-0000-4000-8000-000000000005",
  systemAsset: "e0000000-0000-4000-8000-000000000006",
  unknown: "e0000000-0000-4000-8000-00000000000f",
  foreignTag: "f0000000-0000-4000-8000-00000000000f",
} as const;

const actor = (actorId: string, systemRole: TestActor["systemRole"] = "USER"): TestActor => ({
  actorId,
  systemRole,
});

const GM = actor(ID.gm);
const EDITOR = actor(ID.editor);
const PLAYER = actor(ID.player);
const OUTSIDER = actor(ID.outsider);
const FOREIGN_GM = actor(ID.foreignGm);
const ADMIN = actor(ID.admin, "ADMIN");

const visibilityModule: AppModule = {
  name: "test-tag-visibility",
  dependencies: ["assets"],
  register: (_app, container) => {
    container.dependencies
      .require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES)
      .service.registerVisibilityProvider({
        name: "test-shares",
        listVisibleAssetIds: async ({ actorId }) =>
          actorId === ID.player ? [ID.shared, ID.sharedArchived] : [],
      });
  },
};

describe("tags", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  // A new app per test, because one test can send more requests than one route allows in its window.
  let session: ReturnType<typeof buildTestApp>;

  const tagsUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/tags`;
  const assetTagsUrl = (assetId: string, campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/assets/${assetId}/tags`;

  const create = (payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, { method: "POST", url: tagsUrl(), payload });

  const createOk = async (name: string, extra: Record<string, unknown> = {}) => {
    const response = await create({ name, ...extra });

    expect(response.statusCode).toBe(201);

    return response.json() as { id: string; version: number };
  };

  const patch = (id: string, payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, { method: "PATCH", url: `${tagsUrl()}/${id}`, payload });

  const remove = (id: string, query = "", as: TestActor = GM) =>
    session.injectAs(as, { method: "DELETE", url: `${tagsUrl()}/${id}${query}` });

  const assetVersion = async (id: string) => {
    const [row] = await db.select().from(assets).where(eq(assets.id, id));

    return row!.version;
  };

  const replace = async (assetId: string, tagIds: string[], as: TestActor = GM) =>
    session.injectAs(as, {
      method: "PUT",
      url: assetTagsUrl(assetId),
      payload: { tagIds, expectedVersion: await assetVersion(assetId) },
    });

  const readAssetTags = (assetId: string, as: TestActor = GM) =>
    session.injectAs(as, { method: "GET", url: assetTagsUrl(assetId) });

  const assignedNames = async (assetId: string) =>
    ((await readAssetTags(assetId)).json().tags as { name: string }[]).map((tag) => tag.name);

  const activeAssignments = (assetId: string) =>
    db
      .select()
      .from(assetTags)
      .where(and(eq(assetTags.assetId, assetId), isNull(assetTags.deletedAt)));

  beforeEach(async () => {
    session = buildTestApp({ modules: [...defaultAppModules, visibilityModule] });

    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "TAGS_MAIN",
      name: "Ruleset",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });
    await db.insert(users).values(
      [ID.gm, ID.player, ID.outsider, ID.admin, ID.editor, ID.foreignGm].map((id) => ({
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
      { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      {
        campaignId: ID.foreignCampaign,
        userId: ID.foreignGm,
        role: "EDITOR",
        createdBy: ID.foreignGm,
      },
    ]);

    const own = {
      scope: "CAMPAIGN",
      origin: "CUSTOM",
      campaignId: ID.campaign,
      assetType: "NOTE",
    } as const;

    await db.insert(assets).values([
      { ...own, id: ID.shared, title: "Shared", slug: "shared", status: "ACTIVE" },
      { ...own, id: ID.hidden, title: "Hidden", slug: "hidden", status: "ACTIVE" },
      { ...own, id: ID.archived, title: "Old", slug: "old", status: "ARCHIVED" },
      { ...own, id: ID.sharedArchived, title: "Shared old", slug: "shared-old", status: "ARCHIVED" },
      {
        ...own,
        campaignId: ID.foreignCampaign,
        id: ID.foreignAsset,
        title: "Foreign",
        slug: "foreign",
        status: "ACTIVE",
      },
      {
        scope: "SYSTEM",
        origin: "DEFAULT",
        campaignId: null,
        assetType: "SPELL",
        id: ID.systemAsset,
        title: "Light",
        slug: "light",
        status: "ACTIVE",
      },
    ]);
    await db.insert(tags).values({
      id: ID.foreignTag,
      campaignId: ID.foreignCampaign,
      name: "Foreign",
      normalizedName: "foreign",
    });
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("managing tags", () => {
    it("creates a tag for GMs, editors and administrators and sets the normalized name itself", async () => {
      const response = await create({
        name: "  Boss Fight ",
        color: "#7a1f2b",
        description: "Big ones",
        sortOrder: 3,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        view: "FULL",
        campaignId: ID.campaign,
        name: "Boss Fight",
        color: "#7a1f2b",
        description: "Big ones",
        sortOrder: 3,
        usageCount: 0,
      });
      expect(response.json()).not.toHaveProperty("normalizedName");

      const [row] = await db.select().from(tags).where(eq(tags.id, response.json().id));

      expect(row!.normalizedName).toBe("boss fight");
      expect((await create({ name: "Second" }, EDITOR)).statusCode).toBe(201);
      expect((await create({ name: "Third" }, ADMIN)).statusCode).toBe(201);
    });

    it.each([
      ["same case", "Straße"],
      ["other case", "STRAßE"],
      ["folded letters", "strasse"],
      ["extra spacing", "  STRASSE  "],
    ])("rejects a name that only differs by %s", async (_name, name) => {
      await createOk("Straße");

      const before = await db.select().from(entityChangeEvents);

      expect((await create({ name })).statusCode).toBe(409);
      expect(await db.select().from(entityChangeEvents)).toHaveLength(before.length);
    });

    it("lets only one of two parallel creates through", async () => {
      const responses = await Promise.all([create({ name: "Boss" }), create({ name: "boss" })]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    });

    it("allows the same name in another campaign", async () => {
      const response = await session.injectAs(FOREIGN_GM, {
        method: "POST",
        url: tagsUrl(ID.foreignCampaign),
        payload: { name: "Boss" },
      });

      await createOk("Boss");

      expect(response.statusCode).toBe(201);
    });

    it("can create a deleted name again", async () => {
      const tag = await createOk("Boss");

      expect((await remove(tag.id)).statusCode).toBe(204);
      expect((await create({ name: "BOSS" })).statusCode).toBe(201);
    });

    it("rejects invalid input", async () => {
      expect((await create({ name: "" })).statusCode).toBe(400);
      expect((await create({ name: "Boss", color: "red" })).statusCode).toBe(400);
      expect((await create({ name: "Boss", campaignId: ID.campaign })).statusCode).toBe(400);
    });

    it("rejects violations in the database as well", async () => {
      const row = { campaignId: ID.campaign, name: "Boss", normalizedName: "boss" };

      await db.insert(tags).values(row);

      await expect(db.insert(tags).values(row)).rejects.toThrow();
      await expect(
        db.insert(tags).values({ ...row, normalizedName: "a", color: "red" }),
      ).rejects.toThrow();
      await expect(
        db.insert(tags).values({ ...row, normalizedName: "b", sortOrder: -1 }),
      ).rejects.toThrow();
      await expect(db.insert(tags).values({ ...row, normalizedName: "" })).rejects.toThrow();
      // Tag, asset and link have to share a campaign.
      await expect(
        db
          .insert(assetTags)
          .values({ campaignId: ID.campaign, assetId: ID.shared, tagId: ID.foreignTag }),
      ).rejects.toThrow();
      await expect(
        db
          .insert(assetTags)
          .values({ campaignId: ID.foreignCampaign, assetId: ID.shared, tagId: ID.foreignTag }),
      ).rejects.toThrow();
    });

    it("updates a tag and its normalized name", async () => {
      const tag = await createOk("Boss");
      const response = await patch(
        tag.id,
        { name: "Mini Boss", color: null, expectedVersion: 1 },
        EDITOR,
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ name: "Mini Boss", version: 2, merged: [] });

      const [row] = await db.select().from(tags).where(eq(tags.id, tag.id));

      expect(row!.normalizedName).toBe("mini boss");
    });

    it("rejects renaming to a taken name and a stale version", async () => {
      await createOk("Boss");

      const tag = await createOk("Other");

      expect((await patch(tag.id, { name: "boss", expectedVersion: 1 })).statusCode).toBe(409);
      expect((await patch(tag.id, { name: "First", expectedVersion: 1 })).statusCode).toBe(200);
      expect((await patch(tag.id, { name: "Second", expectedVersion: 1 })).statusCode).toBe(412);
      expect((await patch(tag.id, { color: "#000000", expectedVersion: 1 })).statusCode).toBe(200);
    });

    it("refuses everyone without edit rights", async () => {
      const tag = await createOk("Boss");

      expect((await create({ name: "New" }, PLAYER)).statusCode).toBe(403);
      expect((await create({ name: "New" }, OUTSIDER)).statusCode).toBe(404);
      expect((await create({ name: "New" }, FOREIGN_GM)).statusCode).toBe(404);
      expect((await patch(tag.id, { name: "x", expectedVersion: 1 }, PLAYER)).statusCode).toBe(403);
      expect((await remove(tag.id, "", PLAYER)).statusCode).toBe(403);
      expect((await replace(ID.shared, [tag.id], PLAYER)).statusCode).toBe(403);
      expect((await replace(ID.shared, [tag.id], OUTSIDER)).statusCode).toBe(404);
    });

    it("needs authentication", async () => {
      const response = await session.app.inject({
        method: "POST",
        url: tagsUrl(),
        payload: { name: "Boss" },
      });

      expect(response.statusCode).toBe(401);
    });

    it("hides tags of other campaigns", async () => {
      expect((await patch(ID.foreignTag, { name: "x", expectedVersion: 1 })).statusCode).toBe(404);
      expect((await remove(ID.foreignTag)).statusCode).toBe(404);
      expect(
        (await session.injectAs(GM, { method: "GET", url: tagsUrl(ID.foreignCampaign) })).statusCode,
      ).toBe(404);
    });

    it("pages through the tags and counts usages", async () => {
      const first = await createOk("A", { sortOrder: 1 });

      await createOk("B", { sortOrder: 1 });
      await createOk("C", { sortOrder: 2 });
      await replace(ID.shared, [first.id]);

      const page = (
        await session.injectAs(GM, { method: "GET", url: `${tagsUrl()}?limit=2` })
      ).json();
      const next = (
        await session.injectAs(GM, {
          method: "GET",
          url: `${tagsUrl()}?limit=2&cursor=${page.pageInfo.nextCursor as string}`,
        })
      ).json();

      expect(page.data.map((tag: { usageCount: number }) => tag.usageCount).sort()).toEqual([0, 1]);
      expect(next.data).toHaveLength(1);
      expect(next.pageInfo.nextCursor).toBeNull();
      expect(
        (await session.injectAs(GM, { method: "GET", url: `${tagsUrl()}?cursor=nonsense` }))
          .statusCode,
      ).toBe(400);
    });
  });

  describe("assignments", () => {
    it("replaces the list by writing only the difference", async () => {
      const a = await createOk("A", { sortOrder: 1 });
      const b = await createOk("B", { sortOrder: 2 });
      const c = await createOk("C", { sortOrder: 3 });

      expect((await replace(ID.shared, [a.id, b.id], EDITOR)).statusCode).toBe(200);

      const [kept] = (await activeAssignments(ID.shared)).filter((row) => row.tagId === a.id);
      const response = await replace(ID.shared, [a.id, c.id]);

      expect(response.statusCode).toBe(200);
      expect(response.json().tags.map((tag: { name: string }) => tag.name)).toEqual(["A", "C"]);

      const after = await activeAssignments(ID.shared);

      expect(after.map((row) => row.tagId).sort()).toEqual([a.id, c.id].sort());
      expect(after.find((row) => row.tagId === a.id)?.id).toBe(kept!.id);
      expect((await replace(ID.shared, [])).statusCode).toBe(200);
      expect(await activeAssignments(ID.shared)).toEqual([]);
    });

    it("can assign a removed tag again", async () => {
      const a = await createOk("A");

      await replace(ID.shared, [a.id]);
      await replace(ID.shared, []);

      expect((await replace(ID.shared, [a.id])).statusCode).toBe(200);
      expect(await assignedNames(ID.shared)).toEqual(["A"]);
    });

    it("does not create a version when nothing changes", async () => {
      const a = await createOk("A");

      await replace(ID.shared, [a.id]);

      const version = await assetVersion(ID.shared);

      expect((await replace(ID.shared, [a.id])).statusCode).toBe(200);
      expect(await assetVersion(ID.shared)).toBe(version);
    });

    it.each([
      ["a tag of another campaign", () => [ID.foreignTag], 404],
      ["a missing tag", () => [ID.unknown], 404],
      ["duplicates", () => [ID.unknown, ID.unknown], 400],
    ])("rejects %s and changes nothing", async (_name, tagIds, status) => {
      const a = await createOk("A");

      await replace(ID.shared, [a.id]);

      expect((await replace(ID.shared, [a.id, ...tagIds()])).statusCode).toBe(status);
      expect(await assignedNames(ID.shared)).toEqual(["A"]);
    });

    it("rejects a deleted tag", async () => {
      const a = await createOk("A");

      await remove(a.id);

      expect((await replace(ID.shared, [a.id])).statusCode).toBe(404);
    });

    it("rejects assets of another campaign, global and archived assets", async () => {
      const a = await createOk("A");

      expect((await replace(ID.foreignAsset, [a.id])).statusCode).toBe(404);
      expect(
        (
          await session.injectAs(GM, {
            method: "PUT",
            url: assetTagsUrl(ID.unknown),
            payload: { tagIds: [a.id], expectedVersion: 1 },
          })
        ).statusCode,
      ).toBe(404);
      expect((await replace(ID.systemAsset, [a.id])).statusCode).toBe(409);
      expect((await replace(ID.archived, [a.id])).statusCode).toBe(409);
      expect(await activeAssignments(ID.archived)).toEqual([]);
    });

    it("detects a stale version of the asset", async () => {
      const a = await createOk("A");
      const b = await createOk("B");
      const expectedVersion = await assetVersion(ID.shared);
      const put = (tagIds: string[]) =>
        session.injectAs(GM, {
          method: "PUT",
          url: assetTagsUrl(ID.shared),
          payload: { tagIds, expectedVersion },
        });

      expect((await put([a.id])).statusCode).toBe(200);
      expect((await put([b.id])).statusCode).toBe(412);
      expect(await assignedNames(ID.shared)).toEqual(["A"]);
    });

    it("gives global assets an empty list to read", async () => {
      const response = await readAssetTags(ID.systemAsset);

      expect(response.statusCode).toBe(200);
      expect(response.json().tags).toEqual([]);
    });

    it("hides the assets of other campaigns", async () => {
      expect((await readAssetTags(ID.foreignAsset)).statusCode).toBe(404);
      expect((await readAssetTags(ID.shared, OUTSIDER)).statusCode).toBe(404);
    });
  });

  describe("deleting a tag in use", () => {
    it("refuses it with the number of usages and keeps everything", async () => {
      const a = await createOk("A");

      await replace(ID.shared, [a.id]);

      const response = await remove(a.id);

      expect(response.statusCode).toBe(409);
      expect(response.json().error.details).toEqual({ usageCount: 1 });
      expect(await assignedNames(ID.shared)).toEqual(["A"]);
      expect((await remove(a.id, "?forceDetach=false")).statusCode).toBe(409);
    });

    it("detaches on request and keeps the assets", async () => {
      const a = await createOk("A");
      const b = await createOk("B");

      await replace(ID.shared, [a.id, b.id]);
      await replace(ID.hidden, [a.id]);

      expect((await remove(a.id, "?forceDetach=true")).statusCode).toBe(204);
      expect(await assignedNames(ID.shared)).toEqual(["B"]);
      expect(await assignedNames(ID.hidden)).toEqual([]);

      const [row] = await db.select().from(tags).where(eq(tags.id, a.id));

      expect(row!.deletedAt).not.toBeNull();
      expect(await db.select().from(assets).where(eq(assets.id, ID.shared))).toHaveLength(1);
    });

    it("rolls everything back when an archived asset refuses", async () => {
      const a = await createOk("A");

      await replace(ID.shared, [a.id]);
      await replace(ID.hidden, [a.id]);
      await db.update(assets).set({ status: "ARCHIVED" }).where(eq(assets.id, ID.hidden));

      expect((await remove(a.id, "?forceDetach=true")).statusCode).toBe(409);
      expect(await assignedNames(ID.shared)).toEqual(["A"]);

      const [row] = await db.select().from(tags).where(eq(tags.id, a.id));

      expect(row!.deletedAt).toBeNull();
    });

    it("never leaves an assignment to a deleted tag when both run in parallel", async () => {
      const a = await createOk("A");
      const expectedVersion = await assetVersion(ID.shared);
      const [assign, deletion] = await Promise.all([
        session.injectAs(GM, {
          method: "PUT",
          url: assetTagsUrl(ID.shared),
          payload: { tagIds: [a.id], expectedVersion },
        }),
        remove(a.id),
      ]);

      // Whoever gets the lock first wins; the other one sees the result.
      expect([[200, 409], [404, 204]]).toContainEqual([assign.statusCode, deletion.statusCode]);
    });
  });

  describe("players", () => {
    it("only see tags of visible, active assets, in the reduced view", async () => {
      const onShared = await createOk("On shared", { description: "Internal" });
      const onHidden = await createOk("On hidden");
      const onArchived = await createOk("On archived");

      await createOk("Unused");
      await replace(ID.shared, [onShared.id]);
      await replace(ID.hidden, [onHidden.id]);

      const assignment = {
        campaignId: ID.campaign,
        assetId: ID.sharedArchived,
        tagId: onArchived.id,
      };

      await db.insert(assetTags).values(assignment);

      const response = await session.injectAs(PLAYER, { method: "GET", url: tagsUrl() });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([
        { view: "PLAYER", id: onShared.id, name: "On shared", color: null },
      ]);
    });

    it("see the tags of an asset only if they see the asset", async () => {
      const a = await createOk("A", { description: "Internal" });

      await replace(ID.shared, [a.id]);
      await replace(ID.hidden, [a.id]);

      const response = await readAssetTags(ID.shared, PLAYER);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        view: "PLAYER",
        assetId: ID.shared,
        tags: [{ view: "PLAYER", id: a.id, name: "A", color: null }],
      });
      expect((await readAssetTags(ID.hidden, PLAYER)).statusCode).toBe(404);
      expect((await readAssetTags(ID.sharedArchived, PLAYER)).statusCode).toBe(404);
    });
  });

  describe("history", () => {
    const entries = (type: string, id: string, as: TestActor = GM) =>
      session.injectAs(as, { method: "GET", url: `/api/v1/history/${type}/${id}` });

    const eventOf = async (type: string, id: string, action: string) => {
      const items = (await entries(type, id, ADMIN)).json().data as {
        eventId: string;
        action: string;
        field: string;
      }[];

      return items.find((item) => item.action === action);
    };

    const revert = (eventId: string, as: TestActor = GM) =>
      session.injectAs(as, {
        method: "POST",
        url: `/api/v1/history/events/${eventId}/revert`,
        payload: {},
      });

    it("undoes a rename together with the normalized name", async () => {
      const tag = await createOk("Boss");

      await patch(tag.id, { name: "Mini", expectedVersion: 1 });

      const event = await eventOf("tag", tag.id, "tag.update");

      expect((await revert(event!.eventId, EDITOR)).statusCode).toBe(200);

      const [row] = await db.select().from(tags).where(eq(tags.id, tag.id));

      expect(row).toMatchObject({ name: "Boss", normalizedName: "boss" });
    });

    it("answers 409 when undoing a rename would hit a taken name", async () => {
      const tag = await createOk("Boss");

      await patch(tag.id, { name: "Mini", expectedVersion: 1 });
      await createOk("Boss");

      const event = await eventOf("tag", tag.id, "tag.update");

      expect((await revert(event!.eventId)).statusCode).toBe(409);
    });

    it("is not readable for players and gone after deleting", async () => {
      const tag = await createOk("Boss");

      expect((await entries("tag", tag.id, PLAYER)).statusCode).toBe(404);
      expect((await entries("tag", tag.id, EDITOR)).statusCode).toBe(200);

      await remove(tag.id);

      expect((await entries("tag", tag.id)).statusCode).toBe(404);
    });

    it("records assignments as a list of the asset, which a GM can undo", async () => {
      const a = await createOk("A");
      const b = await createOk("B");

      await replace(ID.shared, [a.id]);
      await replace(ID.shared, [a.id, b.id]);

      const event = await eventOf("asset", ID.shared, "asset.updateTags");

      expect(event?.field).toBe("tagIds");
      expect((await revert(event!.eventId)).statusCode).toBe(200);
      expect(await assignedNames(ID.shared)).toEqual(["A"]);
    });

    it("keeps the history of the asset closed to editors, who can still assign", async () => {
      const a = await createOk("A");

      expect((await replace(ID.shared, [a.id], EDITOR)).statusCode).toBe(200);
      expect((await entries("asset", ID.shared, EDITOR)).statusCode).toBe(404);
    });

    it("does not let a GM undo other changes of an asset because of this", async () => {
      await session.injectAs(ADMIN, {
        method: "PATCH",
        url: `/api/v1/assets/${ID.shared}`,
        payload: { title: "Renamed", expectedVersion: await assetVersion(ID.shared) },
      });

      const event = await eventOf("asset", ID.shared, "asset.update");

      expect((await revert(event!.eventId)).statusCode).toBe(403);
    });

    it("cannot bring back an assignment to a deleted tag", async () => {
      const a = await createOk("A");

      await replace(ID.shared, [a.id]);
      await replace(ID.shared, []);
      await remove(a.id);

      const items = (await entries("asset", ID.shared, ADMIN)).json().data as {
        eventId: string;
        action: string;
        value: string[];
      }[];
      const removal = items.find(
        (item) => item.action === "asset.updateTags" && item.value.length === 0,
      );

      expect((await revert(removal!.eventId)).statusCode).toBe(409);
      expect(await activeAssignments(ID.shared)).toEqual([]);
    });
  });
});
