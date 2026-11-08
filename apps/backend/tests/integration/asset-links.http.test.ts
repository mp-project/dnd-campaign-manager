import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { AppModule } from "#core/app/moduleSystem";
import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetLinks,
  assetReferences,
  assetRulesets,
  assets,
  campaignMemberships,
  campaigns,
  entityChangeEvents,
  rulesets,
  users,
} from "#core/db/schema";
import {
  ASSET_LINKS_MODULE_DEPENDENCIES,
  type AssetLinksModuleDependencies,
} from "#src/modules/asset-links/index";
import type {
  AssetRelationDefinition,
  AssetUsageItemDto,
} from "#src/modules/asset-links/index";
import {
  ASSET_TYPES,
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
  type AssetType,
} from "#src/modules/assets/index";
import { defaultAppModules } from "#src/modules/index";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";
import { createContentUse } from "#test/helpers/contentUse";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  otherRuleset: "10000000-0000-4000-8000-000000002014",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  editor: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  location: "e0000000-0000-4000-8000-000000000001",
  item: "e0000000-0000-4000-8000-000000000002",
  hiddenNote: "e0000000-0000-4000-8000-000000000003",
  archivedNote: "e0000000-0000-4000-8000-000000000004",
  sharedNote: "e0000000-0000-4000-8000-000000000005",
  foreignNote: "e0000000-0000-4000-8000-000000000006",
  systemSpell: "e0000000-0000-4000-8000-000000000007",
  otherRulesetSpell: "e0000000-0000-4000-8000-000000000008",
  draftNote: "e0000000-0000-4000-8000-000000000009",
  unknownAsset: "e0000000-0000-4000-8000-00000000000f",
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

let failUsageProvider = false;
let typedUsageItems: AssetUsageItemDto[] = [];
let registeredRelations: () => readonly AssetRelationDefinition[] = () => [];

const TEST_RELATIONS = ["CONTAINS", "SECRET_OF", "REPEATS"];

/** Everything the real modules register, without the relations of this test. */
const applicationRelations = () =>
  registeredRelations().filter((relation) => !TEST_RELATIONS.includes(relation.type));

const testModule: AppModule = {
  name: "test-asset-links",
  dependencies: ["assets", "asset-links"],
  register: (_app, container) => {
    const assetsService = container.dependencies.require<AssetsModuleDependencies>(
      ASSETS_MODULE_DEPENDENCIES,
    ).service;

    assetsService.registerVisibilityProvider({
      name: "test-shares",
      listVisibleAssetIds: async ({ actorId }) =>
        actorId === ID.player ? [ID.location, ID.sharedNote] : [],
    });

    const { service } = container.dependencies.require<AssetLinksModuleDependencies>(
      ASSET_LINKS_MODULE_DEPENDENCIES,
    );

    registeredRelations = () => service.relations.list();
    service.relations.register({
      type: "CONTAINS",
      sourceTypes: ["LOCATION"],
      targetTypes: ["ITEM"],
      metadataSchema: z.strictObject({ quantity: z.number().int().positive() }),
      playerVisible: true,
      blocksTargetArchive: true,
    });
    service.relations.register({
      type: "SECRET_OF",
      sourceTypes: "ANY",
      targetTypes: "ANY",
      metadataSchema: z.strictObject({}),
      playerVisible: false,
    });
    service.relations.register({
      type: "REPEATS",
      sourceTypes: "ANY",
      targetTypes: "ANY",
      metadataSchema: z.strictObject({}),
      allowSelfLink: true,
      allowMultiple: true,
      playerVisible: true,
    });
    for (const [assetType, segment] of [["ITEM", "items"], ["SPELL", "spells"]] as const) {
      assetsService.registerContentType({
        assetType,
        kind: "RULE",
        editRoutes: ({ campaignId, assetIds }) =>
          new Map(
            assetIds.map((assetId) => [assetId, `/campaigns/${campaignId}/${segment}/${assetId}`]),
          ),
      });
    }
    service.registerUsageProvider({
      name: "test-outline",
      group: "outlinePlacements",
      listUsages: async () => [
        {
          id: "outline-1",
          type: "OUTLINE_ENTRY",
          label: "Visible entry",
          assetId: ID.sharedNote,
          assetType: "NOTE",
          editRoute: "/campaigns/x/outline/1",
        },
        {
          id: "outline-2",
          type: "OUTLINE_ENTRY",
          label: "Hidden entry",
          assetId: ID.hiddenNote,
          assetType: "NOTE",
          editRoute: "/campaigns/x/outline/2",
        },
        {
          id: "outline-3",
          type: "OUTLINE_ENTRY",
          label: "Without asset",
          assetId: null,
          assetType: null,
          editRoute: "/campaigns/x/outline/3",
        },
      ],
    });
    service.registerUsageProvider({
      name: "test-typed",
      group: "typedUsages",
      listUsages: async () => {
        if (failUsageProvider) {
          throw new Error("Provider down");
        }

        return typedUsageItems;
      },
    });
  },
};

describe("asset links", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const contentUse = createContentUse(db);
  // A new app per test, because one test can send more requests than one route allows in its window.
  let session: ReturnType<typeof buildTestApp>;

  const linksUrl = (assetId: string, campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/assets/${assetId}/links`;

  const create = (
    assetId: string,
    payload: Record<string, unknown>,
    as: TestActor = GM,
    campaignId: string = ID.campaign,
  ) => session.injectAs(as, { method: "POST", url: linksUrl(assetId, campaignId), payload });

  const relatedTo = (targetAssetId: string, extra: Record<string, unknown> = {}) => ({
    targetAssetId,
    relationType: "RELATED_TO",
    ...extra,
  });

  const createOk = async (assetId: string, payload: Record<string, unknown>) => {
    const response = await create(assetId, payload);

    expect(response.statusCode).toBe(201);

    return response.json() as { id: string; version: number };
  };

  const list = (assetId: string, as: TestActor = GM, query = "") =>
    session.injectAs(as, { method: "GET", url: `${linksUrl(assetId)}${query}` });

  const usages = (assetId: string, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "GET",
      url: `/api/v1/campaigns/${ID.campaign}/assets/${assetId}/usages`,
    });

  const assetVersion = async (id: string) => {
    const [row] = await db.select().from(assets).where(eq(assets.id, id));

    return row!.version;
  };

  const archive = async (id: string, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "DELETE",
      url: `/api/v1/assets/${id}?expectedVersion=${await assetVersion(id)}`,
    });

  beforeEach(async () => {
    session = buildTestApp({ modules: [...defaultAppModules, testModule, contentUse.module] });
    await session.app.ready();
    failUsageProvider = false;
    typedUsageItems = [];
    contentUse.reset();

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "LINKS_MAIN" },
        { id: ID.otherRuleset, code: "LINKS_OTHER" },
      ].map((ruleset) => ({
        ...ruleset,
        name: "Ruleset",
        status: "ACTIVE" as const,
        editionYear: 2024,
        sourceReference: {},
        licenseCode: "TEST",
      })),
    );
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

    const own = { scope: "CAMPAIGN", origin: "CUSTOM", campaignId: ID.campaign } as const;
    const system = { scope: "SYSTEM", origin: "DEFAULT", campaignId: null } as const;

    await db.insert(assets).values([
      { ...own, id: ID.location, assetType: "LOCATION", title: "Tavern", slug: "tavern", status: "ACTIVE" },
      { ...own, id: ID.item, assetType: "ITEM", title: "Sword", slug: "sword", status: "ACTIVE" },
      { ...own, id: ID.hiddenNote, assetType: "NOTE", title: "Hidden", slug: "hidden", status: "ACTIVE" },
      { ...own, id: ID.sharedNote, assetType: "NOTE", title: "Shared", slug: "shared", status: "ACTIVE" },
      { ...own, id: ID.archivedNote, assetType: "NOTE", title: "Old", slug: "old", status: "ARCHIVED" },
      { ...own, id: ID.draftNote, assetType: "NOTE", title: "Draft", slug: "draft", status: "DRAFT" },
      {
        scope: "CAMPAIGN",
        origin: "CUSTOM",
        campaignId: ID.foreignCampaign,
        id: ID.foreignNote,
        assetType: "NOTE",
        title: "Foreign",
        slug: "foreign",
        status: "ACTIVE",
      },
      { ...system, id: ID.systemSpell, assetType: "SPELL", title: "Light", slug: "light", status: "ACTIVE" },
      {
        ...system,
        id: ID.otherRulesetSpell,
        assetType: "SPELL",
        title: "Old rules",
        slug: "old-rules",
        status: "ACTIVE",
        rulesetPolicy: "RESTRICTED",
      },
    ]);
    await db
      .insert(assetRulesets)
      .values({ assetId: ID.otherRulesetSpell, rulesetId: ID.otherRuleset });
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("creating", () => {
    it("stores a link for GMs, editors and administrators", async () => {
      const response = await create(ID.location, {
        targetAssetId: ID.item,
        relationType: "CONTAINS",
        label: "Loot",
        metadata: { quantity: 2 },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        view: "FULL",
        campaignId: ID.campaign,
        sourceAssetId: ID.location,
        targetAssetId: ID.item,
        relationType: "CONTAINS",
        label: "Loot",
        metadata: { quantity: 2 },
        direction: "outgoing",
        relatedAsset: { id: ID.item, title: "Sword" },
      });
      expect((await create(ID.location, relatedTo(ID.item), EDITOR)).statusCode).toBe(201);
      expect((await create(ID.location, relatedTo(ID.hiddenNote), ADMIN)).statusCode).toBe(201);
    });

    it("links to compatible global assets and drafts of the campaign", async () => {
      expect((await create(ID.location, relatedTo(ID.systemSpell))).statusCode).toBe(201);
      expect((await create(ID.location, relatedTo(ID.draftNote))).statusCode).toBe(201);
    });

    it.each([
      ["unknown relation", { targetAssetId: ID.item, relationType: "NOPE" }, 400],
      ["invalid body", { targetAssetId: "nope", relationType: "RELATED_TO" }, 400],
      ["wrong target type", { targetAssetId: ID.hiddenNote, relationType: "CONTAINS", metadata: { quantity: 1 } }, 400],
      ["wrong metadata", { targetAssetId: ID.item, relationType: "CONTAINS", metadata: { quantity: 0 } }, 400],
      ["unknown metadata", { targetAssetId: ID.item, relationType: "RELATED_TO", metadata: { x: 1 } }, 400],
      ["self link", { targetAssetId: ID.location, relationType: "RELATED_TO" }, 400],
      ["client-set campaign", { targetAssetId: ID.item, relationType: "RELATED_TO", campaignId: ID.campaign }, 400],
      ["target of another campaign", { targetAssetId: ID.foreignNote, relationType: "RELATED_TO" }, 404],
      ["missing target", { targetAssetId: ID.unknownAsset, relationType: "RELATED_TO" }, 404],
      ["archived target", { targetAssetId: ID.archivedNote, relationType: "RELATED_TO" }, 409],
      ["global target of another ruleset", { targetAssetId: ID.otherRulesetSpell, relationType: "RELATED_TO" }, 409],
    ])("rejects %s", async (_name, payload, status) => {
      const response = await create(ID.location, payload);

      expect(response.statusCode).toBe(status);
      expect(await db.select().from(assetLinks)).toEqual([]);
    });

    it("rejects sources that are global, archived or in another campaign", async () => {
      expect((await create(ID.systemSpell, relatedTo(ID.item))).statusCode).toBe(409);
      expect((await create(ID.archivedNote, relatedTo(ID.item))).statusCode).toBe(409);
      expect((await create(ID.foreignNote, relatedTo(ID.item))).statusCode).toBe(404);
    });

    it("allows a self link and duplicates only if the relation says so", async () => {
      const repeats = { targetAssetId: ID.location, relationType: "REPEATS" };

      expect((await create(ID.location, repeats)).statusCode).toBe(201);
      expect((await create(ID.location, repeats)).statusCode).toBe(201);
    });

    it("answers a duplicate with 409 and leaves no history entry", async () => {
      await createOk(ID.location, relatedTo(ID.item));

      const before = await db.select().from(entityChangeEvents);

      expect((await create(ID.location, relatedTo(ID.item))).statusCode).toBe(409);
      expect(await db.select().from(entityChangeEvents)).toHaveLength(before.length);
    });

    it("lets only one of two parallel duplicates through", async () => {
      const responses = await Promise.all([
        create(ID.location, relatedTo(ID.item)),
        create(ID.location, relatedTo(ID.item)),
      ]);

      expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    });

    it("refuses everyone without edit rights", async () => {
      expect((await create(ID.location, relatedTo(ID.item), PLAYER)).statusCode).toBe(403);
      expect((await create(ID.location, relatedTo(ID.item), OUTSIDER)).statusCode).toBe(404);
      expect((await create(ID.location, relatedTo(ID.item), FOREIGN_GM)).statusCode).toBe(404);
      expect(await db.select().from(assetLinks)).toEqual([]);
    });

    it("needs authentication", async () => {
      const response = await session.app.inject({
        method: "POST",
        url: linksUrl(ID.location),
        payload: relatedTo(ID.item),
      });

      expect(response.statusCode).toBe(401);
    });

    it("rejects violations in the database as well", async () => {
      const row = {
        campaignId: ID.campaign,
        sourceAssetId: ID.location,
        targetAssetId: ID.item,
        relationType: "RELATED_TO",
      };

      await expect(db.insert(assetLinks).values({ ...row, sortOrder: -1 })).rejects.toThrow();
      await expect(
        db.insert(assetLinks).values({ ...row, metadata: [] as unknown as object }),
      ).rejects.toThrow();
      // The source has to be part of the campaign of the link.
      await expect(
        db.insert(assetLinks).values({ ...row, sourceAssetId: ID.foreignNote }),
      ).rejects.toThrow();
    });
  });

  describe("every relation of the application", () => {
    /** Valid metadata per relation; a new relation has to be added here. */
    const VALID_METADATA: Record<string, Record<string, unknown>> = {
      RELATED_TO: {},
    };

    const insertAsset = async (assetType: AssetType, slug: string) => {
      const [row] = await db
        .insert(assets)
        .values({
          scope: "CAMPAIGN",
          origin: "CUSTOM",
          campaignId: ID.campaign,
          assetType,
          title: slug,
          slug,
          status: "ACTIVE",
        })
        .returning();

      return row!.id;
    };

    const firstType = (types: readonly AssetType[] | "ANY"): AssetType =>
      types === "ANY" ? "NOTE" : (types[0] as AssetType);

    it("has valid metadata on record for each of them", () => {
      expect(applicationRelations().map((relation) => relation.type).sort()).toEqual(
        Object.keys(VALID_METADATA).sort(),
      );
    });

    it("accepts a valid link and rejects wrong types, metadata and archived or foreign targets", async () => {
      for (const relation of applicationRelations()) {
        const metadata = VALID_METADATA[relation.type] as Record<string, unknown>;
        const source = await insertAsset(firstType(relation.sourceTypes), `s-${relation.type.toLowerCase().replaceAll("_", "-")}`);
        const target = await insertAsset(firstType(relation.targetTypes), `t-${relation.type.toLowerCase().replaceAll("_", "-")}`);
        const payload = { targetAssetId: target, relationType: relation.type, metadata };

        expect((await create(source, payload)).statusCode).toBe(201);
        expect(
          (await create(source, { ...payload, metadata: { ...metadata, notPartOfTheRelation: true } }))
            .statusCode,
        ).toBe(400);
        expect((await create(source, { ...payload, targetAssetId: ID.foreignNote })).statusCode).toBe(404);
        expect((await create(source, { ...payload, targetAssetId: ID.archivedNote })).statusCode).toBe(409);

        if (relation.targetTypes !== "ANY") {
          const wrongType = ASSET_TYPES.find((type) => !relation.targetTypes.includes(type)) as AssetType;
          const wrongTarget = await insertAsset(wrongType, `w-${relation.type.toLowerCase().replaceAll("_", "-")}`);

          expect((await create(source, { ...payload, targetAssetId: wrongTarget })).statusCode).toBe(400);
        }
      }
    });
  });

  describe("reading", () => {
    it("shows incoming and outgoing links with the other end", async () => {
      await createOk(ID.location, relatedTo(ID.item, { sortOrder: 1 }));
      await createOk(ID.hiddenNote, relatedTo(ID.location, { sortOrder: 2 }));

      const all = await list(ID.location);

      expect(all.statusCode).toBe(200);
      expect(
        all.json().data.map((link: { direction: string; relatedAsset: { id: string } }) => [
          link.direction,
          link.relatedAsset.id,
        ]),
      ).toEqual([
        ["outgoing", ID.item],
        ["incoming", ID.hiddenNote],
      ]);
      expect((await list(ID.location, GM, "?direction=incoming")).json().data).toHaveLength(1);
      expect((await list(ID.location, GM, "?relationType=SECRET_OF")).json().data).toEqual([]);
    });

    it("pages through the links", async () => {
      await createOk(ID.location, relatedTo(ID.item, { sortOrder: 1 }));
      await createOk(ID.location, relatedTo(ID.hiddenNote, { sortOrder: 1 }));
      await createOk(ID.location, relatedTo(ID.sharedNote, { sortOrder: 2 }));

      const first = (await list(ID.location, GM, "?limit=2")).json();
      const second = (
        await list(ID.location, GM, `?limit=2&cursor=${first.pageInfo.nextCursor as string}`)
      ).json();

      expect(first.data).toHaveLength(2);
      expect(second.data).toHaveLength(1);
      expect(second.pageInfo.nextCursor).toBeNull();
      expect((await list(ID.location, GM, "?cursor=nonsense")).statusCode).toBe(400);
    });

    it("shows links of a global asset only for the own campaign", async () => {
      await createOk(ID.location, relatedTo(ID.systemSpell));

      expect((await list(ID.systemSpell)).json().data).toHaveLength(1);
      expect(
        (
          await session.injectAs(FOREIGN_GM, {
            method: "GET",
            url: linksUrl(ID.systemSpell, ID.foreignCampaign),
          })
        ).json().data,
      ).toEqual([]);
    });

    it("hides assets of other campaigns and from non-members", async () => {
      expect((await list(ID.foreignNote)).statusCode).toBe(404);
      expect((await list(ID.location, OUTSIDER)).statusCode).toBe(404);
      expect((await list(ID.location, FOREIGN_GM)).statusCode).toBe(404);
    });

    it("shows players only shared, non-secret links with visible ends and no internal fields", async () => {
      await createOk(ID.location, { targetAssetId: ID.item, relationType: "CONTAINS", metadata: { quantity: 1 } });
      await createOk(ID.location, relatedTo(ID.sharedNote));
      await createOk(ID.location, relatedTo(ID.hiddenNote));
      await createOk(ID.location, { targetAssetId: ID.systemSpell, relationType: "SECRET_OF" });
      await createOk(ID.location, relatedTo(ID.systemSpell));

      const response = await list(ID.location, PLAYER);
      const data = response.json().data as Record<string, unknown>[];

      expect(response.statusCode).toBe(200);
      expect(data.map((link) => (link.relatedAsset as { id: string }).id).sort()).toEqual(
        [ID.sharedNote, ID.systemSpell].sort(),
      );

      for (const link of data) {
        expect(link.view).toBe("PLAYER");
        expect(link).not.toHaveProperty("metadata");
        expect(link).not.toHaveProperty("createdBy");
        expect(link.relatedAsset).not.toHaveProperty("status");
      }
    });

    it("hides the links of an asset the player cannot see", async () => {
      expect((await list(ID.hiddenNote, PLAYER)).statusCode).toBe(404);
      expect((await usages(ID.hiddenNote, PLAYER)).statusCode).toBe(404);
    });
  });

  describe("updating and deleting", () => {
    const linkUrl = (assetId: string, linkId: string) => `${linksUrl(assetId)}/${linkId}`;

    const patch = (
      assetId: string,
      linkId: string,
      payload: Record<string, unknown>,
      as: TestActor = GM,
    ) => session.injectAs(as, { method: "PATCH", url: linkUrl(assetId, linkId), payload });

    const remove = (assetId: string, linkId: string, as: TestActor = GM) =>
      session.injectAs(as, { method: "DELETE", url: linkUrl(assetId, linkId) });

    it("changes label, position and metadata", async () => {
      const link = await createOk(ID.location, {
        targetAssetId: ID.item,
        relationType: "CONTAINS",
        metadata: { quantity: 1 },
      });
      const response = await patch(
        ID.location,
        link.id,
        { label: "Chest", sortOrder: 4, metadata: { quantity: 3 }, expectedVersion: 1 },
        EDITOR,
      );

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        label: "Chest",
        sortOrder: 4,
        metadata: { quantity: 3 },
        version: 2,
        merged: [],
      });
    });

    it("validates the metadata against the relation", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      expect(
        (await patch(ID.location, link.id, { metadata: { x: 1 }, expectedVersion: 1 })).statusCode,
      ).toBe(400);
    });

    it("reports conflicts of a stale version per field and keeps other changes", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      await patch(ID.location, link.id, { label: "First", expectedVersion: 1 });

      expect((await patch(ID.location, link.id, { label: "Second", expectedVersion: 1 })).statusCode).toBe(412);
      expect((await patch(ID.location, link.id, { sortOrder: 3, expectedVersion: 1 })).statusCode).toBe(200);
    });

    it("only finds the link through its source and campaign", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      // The target end cannot change it.
      expect((await patch(ID.item, link.id, { label: "x", expectedVersion: 1 })).statusCode).toBe(404);
      expect((await remove(ID.item, link.id)).statusCode).toBe(404);
      expect(
        (
          await session.injectAs(FOREIGN_GM, {
            method: "DELETE",
            url: `${linksUrl(ID.foreignNote, ID.foreignCampaign)}/${link.id}`,
          })
        ).statusCode,
      ).toBe(404);
    });

    it("refuses players", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      expect((await patch(ID.location, link.id, { label: "x", expectedVersion: 1 }, PLAYER)).statusCode).toBe(403);
      expect((await remove(ID.location, link.id, PLAYER)).statusCode).toBe(403);
    });

    it("does not change links of an archived source, but still allows removing them", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      expect((await archive(ID.location)).statusCode).toBe(200);
      expect((await patch(ID.location, link.id, { label: "x", expectedVersion: 1 })).statusCode).toBe(409);
      expect((await remove(ID.location, link.id)).statusCode).toBe(204);
    });

    it("soft deletes only the link, and the same link can be created again", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      expect((await remove(ID.location, link.id)).statusCode).toBe(204);
      expect((await list(ID.location)).json().data).toEqual([]);
      expect((await remove(ID.location, link.id)).statusCode).toBe(404);

      const [stored] = await db.select().from(assetLinks).where(eq(assetLinks.id, link.id));

      expect(stored!.deletedAt).not.toBeNull();
      expect(await db.select().from(assets).where(eq(assets.id, ID.item))).toHaveLength(1);
      expect((await create(ID.location, relatedTo(ID.item))).statusCode).toBe(201);
    });
  });

  describe("usages", () => {
    it("groups links and provider results for GMs, with edit routes", async () => {
      await createOk(ID.location, { targetAssetId: ID.item, relationType: "CONTAINS", label: "Loot", metadata: { quantity: 1 } });
      await createOk(ID.hiddenNote, relatedTo(ID.location));

      const response = await usages(ID.location);
      const body = response.json();

      expect(response.statusCode).toBe(200);
      expect(body.outgoing).toEqual([
        expect.objectContaining({
          type: "CONTAINS",
          label: "Loot",
          assetId: ID.item,
          assetType: "ITEM",
          editRoute: `/campaigns/${ID.campaign}/items/${ID.item}`,
        }),
      ]);
      expect(body.incoming).toEqual([
        expect.objectContaining({ label: "Hidden", assetId: ID.hiddenNote, editRoute: null }),
      ]);
      expect(body.outlinePlacements).toHaveLength(3);
      // An entry without an asset belongs to the campaign; its provider decides the route.
      expect(body.outlinePlacements).toContainEqual(
        expect.objectContaining({ id: "outline-3", editRoute: "/campaigns/x/outline/3" }),
      );
      expect(body.shares).toEqual([]);
      expect(body.unavailableProviders).toEqual([]);
    });

    it("filters everything a player may not see", async () => {
      await createOk(ID.hiddenNote, relatedTo(ID.location));
      await createOk(ID.sharedNote, relatedTo(ID.location));

      const body = (await usages(ID.location, PLAYER)).json();

      expect(body.incoming.map((item: { assetId: string }) => item.assetId)).toEqual([ID.sharedNote]);
      expect(body.outlinePlacements).toEqual([
        expect.objectContaining({ label: "Visible entry", editRoute: null }),
      ]);
    });

    it("stays available when a provider fails, and says so", async () => {
      failUsageProvider = true;

      const response = await usages(ID.location);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        typedUsages: [],
        unavailableProviders: ["test-typed"],
      });
      expect(response.json().outlinePlacements).toHaveLength(3);
    });

    it("hides usages from non-members", async () => {
      expect((await usages(ID.location, OUTSIDER)).statusCode).toBe(404);
      expect((await usages(ID.foreignNote)).statusCode).toBe(404);
    });

    const usageOf = (assetId: string, editRoute: string): AssetUsageItemDto => ({
      id: `usage-${assetId}`,
      type: "TEST_USAGE",
      label: "Typed",
      assetId,
      assetType: "SPELL",
      editRoute,
    });
    const setStatus = (id: string, status: "DRAFT" | "ARCHIVED") =>
      db.update(assets).set({ status }).where(eq(assets.id, id));

    it("hides links to global drafts from GMs, not from administrators", async () => {
      await createOk(ID.location, relatedTo(ID.systemSpell));
      await setStatus(ID.systemSpell, "DRAFT");

      expect((await usages(ID.location)).json().outgoing).toEqual([]);
      expect((await usages(ID.location, ADMIN)).json().outgoing).toEqual([
        expect.objectContaining({ assetId: ID.systemSpell }),
      ]);
    });

    it("gives only administrators edit routes to global content", async () => {
      await createOk(ID.location, relatedTo(ID.systemSpell));
      typedUsageItems = [usageOf(ID.systemSpell, "/spells/edit")];

      const asGm = (await usages(ID.location)).json();
      const asAdmin = (await usages(ID.location, ADMIN)).json();

      expect(asGm.outgoing).toEqual([expect.objectContaining({ assetId: ID.systemSpell, editRoute: null })]);
      expect(asGm.typedUsages).toEqual([expect.objectContaining({ editRoute: null })]);
      expect(asAdmin.outgoing).toEqual([
        expect.objectContaining({ editRoute: `/campaigns/${ID.campaign}/spells/${ID.systemSpell}` }),
      ]);
      expect(asAdmin.typedUsages).toEqual([expect.objectContaining({ editRoute: "/spells/edit" })]);
    });

    it("keeps the edit route of items about the global asset itself, such as its share", async () => {
      typedUsageItems = [usageOf(ID.systemSpell, `/campaigns/${ID.campaign}/shares/1`)];

      expect((await usages(ID.systemSpell)).json().typedUsages).toEqual([
        expect.objectContaining({ editRoute: `/campaigns/${ID.campaign}/shares/1` }),
      ]);
    });

    it("shows players archived global content only while the campaign uses it", async () => {
      typedUsageItems = [usageOf(ID.systemSpell, "/spells/edit")];
      await setStatus(ID.systemSpell, "ARCHIVED");

      expect((await usages(ID.location, PLAYER)).json().typedUsages).toEqual([]);

      await contentUse.use(ID.campaign, ID.systemSpell);

      expect((await usages(ID.location, PLAYER)).json().typedUsages).toEqual([
        expect.objectContaining({ assetId: ID.systemSpell, editRoute: null }),
      ]);
    });

    it("shows the same link ends in links and usages", async () => {
      await createOk(ID.location, relatedTo(ID.systemSpell));
      await createOk(ID.location, relatedTo(ID.item));
      // The global spell moves to another ruleset: no longer part of this campaign.
      await db.update(assets).set({ rulesetPolicy: "RESTRICTED" }).where(eq(assets.id, ID.systemSpell));
      await db.insert(assetRulesets).values({ assetId: ID.systemSpell, rulesetId: ID.otherRuleset });

      const listed = (await list(ID.location)).json().data as { relatedAsset: { id: string } }[];
      const used = (await usages(ID.location)).json().outgoing as { assetId: string }[];

      expect(listed.map((link) => link.relatedAsset.id)).toEqual([ID.item]);
      expect(used.map((item) => item.assetId)).toEqual([ID.item]);
      expect((await usages(ID.systemSpell)).statusCode).toBe(404);
      expect((await usages(ID.systemSpell, ADMIN)).statusCode).toBe(200);
    });

    it("shows players archived content the campaign uses in links and its own usages", async () => {
      await createOk(ID.location, relatedTo(ID.systemSpell));
      await setStatus(ID.systemSpell, "ARCHIVED");

      const linkedIds = async () =>
        ((await list(ID.location, PLAYER)).json().data as { relatedAsset: { id: string } }[]).map(
          (link) => link.relatedAsset.id,
        );

      expect(await linkedIds()).toEqual([]);
      expect((await usages(ID.systemSpell, PLAYER)).statusCode).toBe(404);

      await contentUse.use(ID.campaign, ID.systemSpell);

      expect(await linkedIds()).toEqual([ID.systemSpell]);
      expect((await usages(ID.systemSpell, PLAYER)).statusCode).toBe(200);
    });
  });

  describe("archiving a used asset", () => {
    const containsItem = { targetAssetId: ID.item, relationType: "CONTAINS", metadata: { quantity: 1 } };

    it("rejects it with 409 and the list, until the blocking link is gone", async () => {
      const link = await createOk(ID.location, containsItem);
      const blocked = await archive(ID.item);

      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.details.blockingUsages).toEqual([
        expect.objectContaining({ id: link.id, type: "CONTAINS", assetId: ID.location }),
      ]);

      const [row] = await db.select().from(assets).where(eq(assets.id, ID.item));

      expect(row!.status).toBe("ACTIVE");

      await session.injectAs(GM, { method: "DELETE", url: `${linksUrl(ID.location)}/${link.id}` });

      expect((await archive(ID.item)).statusCode).toBe(200);
    });

    it("does not block for links of other relations or for the source", async () => {
      await createOk(ID.location, relatedTo(ID.item));

      expect((await archive(ID.item)).statusCode).toBe(200);

      const other = await createOk(ID.sharedNote, relatedTo(ID.hiddenNote));

      expect(other.id).toBeDefined();
      expect((await archive(ID.sharedNote)).statusCode).toBe(200);
    });

    it("also counts content that refers to the asset, unless that content is archived", async () => {
      // As the content kernel stores it for definitions that refer to the item.
      await db.insert(assetReferences).values({
        sourceAssetId: ID.location,
        targetAssetId: ID.item,
        path: "loot.0",
        kind: "LOOT",
        position: 0,
      });

      const blocked = await archive(ID.item);

      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.details.blockingUsages).toEqual([
        expect.objectContaining({ id: ID.location, assetId: ID.location, type: "LOCATION_LOOT" }),
      ]);

      await db.update(assets).set({ status: "ARCHIVED" }).where(eq(assets.id, ID.location));

      expect((await archive(ID.item)).statusCode).toBe(200);
    });

    it("cannot be bypassed by undoing a restore", async () => {
      expect((await archive(ID.item)).statusCode).toBe(200);
      expect(
        (
          await session.injectAs(GM, {
            method: "POST",
            url: `/api/v1/assets/${ID.item}/restore`,
            payload: { expectedVersion: await assetVersion(ID.item) },
          })
        ).statusCode,
      ).toBe(200);

      await createOk(ID.location, containsItem);

      const [restore] = await db
        .select()
        .from(entityChangeEvents)
        .where(
          and(eq(entityChangeEvents.entityId, ID.item), eq(entityChangeEvents.action, "asset.restore")),
        );
      const undo = await session.injectAs(GM, {
        method: "POST",
        url: `/api/v1/history/events/${restore!.id}/revert`,
        payload: {},
      });

      expect(undo.statusCode).toBe(409);
    });

    it("never ends with a blocking link to an archived asset when both run in parallel", async () => {
      const version = await assetVersion(ID.item);
      const [createResponse, archiveResponse] = await Promise.all([
        create(ID.location, containsItem),
        session.injectAs(GM, {
          method: "DELETE",
          url: `/api/v1/assets/${ID.item}?expectedVersion=${version}`,
        }),
      ]);

      const outcome = [createResponse.statusCode, archiveResponse.statusCode];

      // Whoever gets the lock first wins; the other one sees the result.
      expect([[201, 409], [409, 200]]).toContainEqual(outcome);
    });
  });

  describe("history", () => {
    const entries = async (id: string, as: TestActor = GM, query = "") =>
      session.injectAs(as, { method: "GET", url: `/api/v1/history/assetLink/${id}${query}` });

    it("records changes and lets editors undo them", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      await session.injectAs(GM, {
        method: "PATCH",
        url: `${linksUrl(ID.location)}/${link.id}`,
        payload: { label: "Door", expectedVersion: 1 },
      });

      const list = (await entries(link.id, EDITOR)).json().data as {
        eventId: string;
        action: string;
        field: string;
      }[];
      const change = list.find((item) => item.action === "assetLink.update");

      expect(change?.field).toBe("label");

      const undo = await session.injectAs(EDITOR, {
        method: "POST",
        url: `/api/v1/history/events/${change!.eventId}/revert`,
        payload: {},
      });

      expect(undo.statusCode).toBe(200);

      const [stored] = await db.select().from(assetLinks).where(eq(assetLinks.id, link.id));

      expect(stored!.label).toBeNull();
    });

    it("appears as a child in the history of the source asset", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));
      const items = (
        await session.injectAs(GM, {
          method: "GET",
          url: `/api/v1/history/asset/${ID.location}?includeChildren=true`,
        })
      ).json().data as { entityType: string; entityId: string }[];

      expect(items.some((item) => item.entityType === "assetLink" && item.entityId === link.id)).toBe(
        true,
      );
    });

    it("is not readable for players and outsiders", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      expect((await entries(link.id, PLAYER)).statusCode).toBe(404);
      expect((await entries(link.id, OUTSIDER)).statusCode).toBe(404);
    });

    it("is gone once the link is deleted", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      await session.injectAs(GM, { method: "DELETE", url: `${linksUrl(ID.location)}/${link.id}` });

      expect((await entries(link.id)).statusCode).toBe(404);
    });

    it("rejects undoing while the source is archived", async () => {
      const link = await createOk(ID.location, relatedTo(ID.item));

      await session.injectAs(GM, {
        method: "PATCH",
        url: `${linksUrl(ID.location)}/${link.id}`,
        payload: { label: "Door", expectedVersion: 1 },
      });

      const change = ((await entries(link.id)).json().data as { eventId: string; action: string }[]).find(
        (item) => item.action === "assetLink.update",
      );

      expect((await archive(ID.location)).statusCode).toBe(200);
      expect(
        (
          await session.injectAs(GM, {
            method: "POST",
            url: `/api/v1/history/events/${change!.eventId}/revert`,
            payload: {},
          })
        ).statusCode,
      ).toBe(409);
    });
  });
});
