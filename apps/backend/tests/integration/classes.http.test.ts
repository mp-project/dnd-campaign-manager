import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assets,
  campaignMemberships,
  campaigns,
  classes,
  rulesets,
  users,
} from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  otherRuleset: "10000000-0000-4000-8000-000000002014",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  editor: "a0000000-0000-4000-8000-000000000004",
  outsider: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  admin: "a0000000-0000-4000-8000-000000000007",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  axe: "e0000000-0000-4000-8000-000000000001",
  foreignAxe: "e0000000-0000-4000-8000-000000000002",
  systemAxe: "e0000000-0000-4000-8000-000000000003",
  path: "e0000000-0000-4000-8000-000000000004",
  unknown: "f0000000-0000-4000-8000-00000000000f",
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

type ClassBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  scope: string;
  status: string;
  code: string;
  name: string;
  campaignId: string | null;
  rulesetIds?: string[];
  releasedToPlayers?: boolean;
  levels: { level: number; featureGrants: { key: string; featureAssetId: string }[] }[];
  startingEquipment: { entries: { itemAssetId: string | null }[] }[];
  choices: { key: string; options: { linkedAssetId: string | null }[] }[];
  merged?: string[];
};

type FeatureBody = { id: string; assetId: string; version: number; assetVersion: number };

const subclassChoice = {
  key: "subclass",
  level: 3,
  choiceType: "SUBCLASS",
  minimumSelections: 1,
  maximumSelections: 1,
  optionFilter: { assetTypes: ["SUBCLASS"] },
  displayOrder: 0,
};

const BARBARIAN = {
  name: "Barbarian",
  hitDie: "D12",
  firstLevelHitPoints: 12,
  fixedHitPointsPerLevel: 7,
  subclassSelectionLevel: 3,
  description: "Rage **hard** <script>alert(1)</script>",
  primaryAbilities: { combinationMode: "ALL", abilities: ["str"] },
  choices: [subclassChoice],
  multiclass: { abilityRequirements: [{ ability: "str", minimum: 13 }] },
};

const levelsWith = (grants: Record<number, unknown[]>) =>
  Array.from({ length: 20 }, (_, index) => ({
    level: index + 1,
    featureGrants: grants[index + 1] ?? [],
  }));

const rageGrant = (featureAssetId: string, bindings: unknown[] = [usesBinding]) => ({
  key: "rage",
  featureAssetId,
  grantOperation: "GRANT",
  displayOrder: 0,
  bindings,
});

const usesBinding = { parameterKey: "uses", bindingSource: "PROGRESSION_TRACK", trackKey: "rages" };

const rages = {
  key: "rages",
  label: "Rages",
  valueType: "INTEGER",
  displayOrder: 0,
  values: [
    { level: 1, value: 2 },
    { level: 3, value: 3 },
  ],
};

describe("classes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/classes`;
  const catalogUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/catalog/classes`;
  const systemUrl = "/api/v1/classes";

  const create = (payload: Record<string, unknown>, as: TestActor = GM, url = campaignUrl()) =>
    session.injectAs(as, { method: "POST", url, payload });

  const createOk = async (
    payload: Record<string, unknown> = {},
    as: TestActor = GM,
    url = campaignUrl(),
  ) => {
    const response = await create({ ...BARBARIAN, ...payload }, as, url);

    expect({ status: response.statusCode, body: response.statusCode === 201 ? null : response.json() }).toEqual({
      status: 201,
      body: null,
    });

    return response.json() as ClassBody;
  };

  const createSystem = (payload: Record<string, unknown> = {}, rulesetIds: string[] = [ID.ruleset]) =>
    createOk({ rulesetPolicy: "RESTRICTED", rulesetIds, ...payload }, ADMIN, systemUrl);

  const itemUrl = (item: ClassBody) =>
    item.campaignId ? `${campaignUrl(item.campaignId)}/${item.id}` : `${systemUrl}/${item.id}`;

  const update = (item: ClassBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "PATCH",
      url: itemUrl(item),
      payload: {
        expectedVersion: item.version,
        expectedAssetVersion: item.assetVersion,
        ...payload,
      },
    });

  const remove = (item: ClassBody, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "DELETE",
      url: `${itemUrl(item)}?expectedAssetVersion=${item.assetVersion}`,
    });

  const get = (url: string, as: TestActor = GM) => session.injectAs(as, { method: "GET", url });

  /** A feature with a required integer parameter `uses`. */
  const createFeature = async (
    as: TestActor = GM,
    url = `/api/v1/campaigns/${ID.campaign}/features`,
    payload: Record<string, unknown> = {},
  ) => {
    const response = await session.injectAs(as, {
      method: "POST",
      url,
      payload: {
        name: "Rage",
        featureType: "RESOURCE",
        parameters: [{ key: "uses", valueType: "INTEGER", required: true }],
        ...payload,
      },
    });

    expect(response.statusCode).toBe(201);

    return response.json() as FeatureBody;
  };

  const createSystemFeature = () =>
    createFeature(ADMIN, "/api/v1/features", {
      rulesetPolicy: "RESTRICTED",
      rulesetIds: [ID.ruleset],
    });

  const classCount = async () => (await db.select().from(classes)).length;
  const classAssetCount = async () =>
    (await db.select().from(assets).where(eq(assets.assetType, "CLASS"))).length;

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "CLASSES_2024", editionYear: 2024 },
        { id: ID.otherRuleset, code: "CLASSES_2014", editionYear: 2014 },
      ].map((ruleset) => ({
        ...ruleset,
        name: ruleset.code,
        status: "ACTIVE" as const,
        sourceReference: {},
        licenseCode: "TEST",
      })),
    );
    await db.insert(users).values(
      [ID.gm, ID.player, ID.editor, ID.outsider, ID.foreignGm, ID.admin].map((id) => ({
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
      status: "ACTIVE",
    } as const;

    await db.insert(assets).values([
      { ...own, id: ID.axe, title: "Axe", slug: "axe", assetType: "ITEM" },
      { ...own, id: ID.path, title: "Berserker", slug: "berserker", assetType: "SUBCLASS" },
      {
        ...own,
        campaignId: ID.foreignCampaign,
        id: ID.foreignAxe,
        title: "Foreign",
        slug: "foreign",
        assetType: "ITEM",
      },
      {
        id: ID.systemAxe,
        title: "Greataxe",
        slug: "greataxe",
        scope: "SYSTEM",
        origin: "DEFAULT",
        campaignId: null,
        status: "ACTIVE",
        assetType: "ITEM",
      },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("custom classes", () => {
    it("creates asset and class in one go, fills the levels and renders the text harmless", async () => {
      const item = await createOk();

      expect(item).toMatchObject({
        view: "GM",
        scope: "CAMPAIGN",
        campaignId: ID.campaign,
        name: "Barbarian",
        code: "barbarian",
        status: "ACTIVE",
        hitDie: "D12",
        maximumLevel: 20,
        subclassSelectionLevel: 3,
        releasedToPlayers: false,
        spellcasting: null,
      });
      expect(item.levels.map((entry) => entry.level)).toEqual(
        Array.from({ length: 20 }, (_, index) => index + 1),
      );
      expect(item).toHaveProperty("descriptionHtml", expect.stringContaining("<strong>hard</strong>"));
      expect(item).toHaveProperty("description", BARBARIAN.description);
      expect(item).toHaveProperty("descriptionHtml", expect.not.stringContaining("<script>"));

      const [asset] = await db.select().from(assets).where(eq(assets.id, item.assetId));

      expect(asset).toMatchObject({ assetType: "CLASS", scope: "CAMPAIGN", origin: "CUSTOM" });
    });

    it("lets GMs, editors and admins write, refuses players and hides the campaign from others", async () => {
      await createOk({ code: "by-editor" }, EDITOR);
      await createOk({ code: "by-admin" }, ADMIN);

      expect((await create(BARBARIAN, PLAYER)).statusCode).toBe(403);
      expect((await create(BARBARIAN, OUTSIDER)).statusCode).toBe(404);
      expect((await create(BARBARIAN, FOREIGN_GM)).statusCode).toBe(404);
    });

    it("refuses invalid definitions and fields the client may not set", async () => {
      for (const payload of [
        { ...BARBARIAN, hitDie: "D20" },
        { ...BARBARIAN, choices: [] },
        { ...BARBARIAN, subclassSelectionLevel: 2 },
        { ...BARBARIAN, levels: levelsWith({}).slice(0, 19) },
        { ...BARBARIAN, campaignId: ID.foreignCampaign },
        { ...BARBARIAN, scope: "SYSTEM" },
        { ...BARBARIAN, rulesetIds: [ID.ruleset] },
      ]) {
        const response = await create(payload);

        expect({ keys: Object.keys(payload), status: response.statusCode }).toEqual({
          keys: Object.keys(payload),
          status: 400,
        });
      }

      expect(await classCount()).toBe(0);
    });

    it("keeps codes unique per campaign and rolls the asset back", async () => {
      await createOk();

      expect((await create({ ...BARBARIAN, name: "Other", code: "barbarian" })).statusCode).toBe(409);
      expect(await classAssetCount()).toBe(1);

      await createOk({}, FOREIGN_GM, campaignUrl(ID.foreignCampaign));
    });

    it("hides classes of other campaigns", async () => {
      const foreign = await createOk({}, FOREIGN_GM, campaignUrl(ID.foreignCampaign));

      expect((await get(`${campaignUrl()}/${foreign.id}`)).statusCode).toBe(404);
      expect((await get(`${catalogUrl()}/${foreign.id}`)).statusCode).toBe(404);
      expect((await get(`${catalogUrl()}/${foreign.id}/progression`)).statusCode).toBe(404);
      expect(
        (
          await session.injectAs(GM, {
            method: "PATCH",
            url: `${campaignUrl()}/${foreign.id}`,
            payload: { expectedVersion: 1, expectedAssetVersion: 1, displayOrder: 2 },
          })
        ).statusCode,
      ).toBe(404);
    });

    it("updates the definition atomically and refuses mixing two versions of it", async () => {
      const item = await createOk({ progressionTracks: [rages] });
      const first = await update(item, { progressionTracks: [] }, EDITOR);

      expect(first.statusCode).toBe(200);

      // Another definition part from the old version is a conflict, a text field is merged.
      expect(
        (await update(item, { firstLevelHitPoints: 10, multiclass: { abilityRequirements: [] } })).statusCode,
      ).toBe(412);

      const merged = await update(item, { description: "New text", name: "Berserker class" });

      expect(merged.statusCode).toBe(200);
      expect(merged.json()).toMatchObject({ description: "New text", name: "Berserker class", progressionTracks: [] });
    });

    it("checks the merged definition, so a binding cannot refer to a track that is gone", async () => {
      const feature = await createFeature();
      const item = await createOk({
        progressionTracks: [rages],
        levels: levelsWith({ 1: [rageGrant(feature.assetId)] }),
      });
      const response = await update(item, { progressionTracks: [] });

      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(response.json())).toContain("Unknown progression track");

      // Lowering the maximum level needs matching level entries.
      expect((await update(item, { maximumLevel: 10 })).statusCode).toBe(400);
    });

    it("archives and restores; archived classes cannot change or be chosen anew", async () => {
      const item = await createOk();
      const archived = await remove(item);

      expect(archived.statusCode).toBe(200);
      expect(archived.json()).toMatchObject({ status: "ARCHIVED" });
      expect((await get(campaignUrl())).json().data).toHaveLength(0);
      expect((await get(catalogUrl())).json().data).toHaveLength(0);
      expect((await get(`${campaignUrl()}?status=ARCHIVED`)).json().data).toHaveLength(1);
      // Still readable for characters that already have it.
      expect((await get(`${catalogUrl()}/${item.id}`)).statusCode).toBe(200);
      expect((await update(archived.json() as ClassBody, { displayOrder: 1 })).statusCode).toBe(409);

      const restored = await session.injectAs(EDITOR, {
        method: "POST",
        url: `${itemUrl(item)}/restore`,
        payload: { expectedAssetVersion: (archived.json() as ClassBody).assetVersion },
      });

      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({ status: "ACTIVE" });
      expect(await classCount()).toBe(1);
    });

    it("rolls back the whole action when a later step fails", async () => {
      const response = await create({
        ...BARBARIAN,
        levels: levelsWith({ 1: [rageGrant(ID.unknown, [])] }),
      });

      expect(response.statusCode).toBe(404);
      expect(await classCount()).toBe(0);
      expect(await classAssetCount()).toBe(0);
    });
  });

  describe("references", () => {
    it("checks granted features, their bindings and other referenced assets", async () => {
      const feature = await createFeature();
      const status = async (payload: Record<string, unknown>) => (await create(payload)).statusCode;

      // Unknown and foreign assets are not found; wrong types and broken bindings conflict.
      expect(await status({ ...BARBARIAN, levels: levelsWith({ 1: [rageGrant(ID.unknown)] }), progressionTracks: [rages] })).toBe(404);
      expect(await status({ ...BARBARIAN, levels: levelsWith({ 1: [rageGrant(ID.foreignAxe)] }), progressionTracks: [rages] })).toBe(404);
      expect(await status({ ...BARBARIAN, levels: levelsWith({ 1: [rageGrant(ID.axe)] }), progressionTracks: [rages] })).toBe(409);

      const unbound = await create({ ...BARBARIAN, levels: levelsWith({ 1: [rageGrant(feature.assetId, [])] }) });

      expect(unbound.statusCode).toBe(409);
      expect(JSON.stringify(unbound.json())).toContain("Required parameter 'uses' is not bound");

      const wrongParameter = await create({
        ...BARBARIAN,
        levels: levelsWith({
          1: [rageGrant(feature.assetId, [usesBinding, { parameterKey: "other", bindingSource: "STATIC", staticValue: 1 }])],
        }),
        progressionTracks: [rages],
      });

      expect(wrongParameter.statusCode).toBe(409);
      expect(JSON.stringify(wrongParameter.json())).toContain("The feature has no parameter 'other'");

      const wrongType = await create({
        ...BARBARIAN,
        levels: levelsWith({ 1: [rageGrant(feature.assetId, [{ parameterKey: "uses", bindingSource: "STATIC", staticValue: "two" }])] }),
      });

      expect(wrongType.statusCode).toBe(409);

      expect(
        await status({
          ...BARBARIAN,
          choices: [{ ...subclassChoice, options: [{ code: "axe", label: "Axe", linkedAssetId: ID.axe }] }],
        }),
      ).toBe(409);
      expect(
        await status({
          ...BARBARIAN,
          startingEquipment: [
            { code: "kit", name: "Kit", optionType: "EQUIPMENT", displayOrder: 0, entries: [{ entryType: "FIXED_ITEM", itemAssetId: ID.path }] },
          ],
        }),
      ).toBe(409);
      expect(await classCount()).toBe(0);

      await createOk({
        progressionTracks: [rages],
        levels: levelsWith({ 1: [rageGrant(feature.assetId)] }),
        choices: [{ ...subclassChoice, options: [{ code: "berserker", label: "Berserker", linkedAssetId: ID.path }] }],
        startingEquipment: [
          { code: "kit", name: "Kit", optionType: "EQUIPMENT", displayOrder: 0, entries: [{ entryType: "FIXED_ITEM", itemAssetId: ID.axe }] },
        ],
      });
    });

    it("keeps granted features from being archived and lists the class as usage", async () => {
      const feature = await createFeature();
      const item = await createOk({
        progressionTracks: [rages],
        levels: levelsWith({ 1: [rageGrant(feature.assetId)] }),
      });

      const archive = await session.injectAs(GM, {
        method: "DELETE",
        url: `/api/v1/campaigns/${ID.campaign}/features/${feature.id}?expectedAssetVersion=${feature.assetVersion}`,
      });

      expect(archive.statusCode).toBe(409);

      const usages = await get(`/api/v1/campaigns/${ID.campaign}/features/${feature.id}/usages`);

      expect(usages.json().typedUsages).toEqual([
        expect.objectContaining({ id: item.id, type: "CLASS_DEFINITION", assetType: "CLASS" }),
      ]);

      // Once the class is archived, the feature may go as well.
      expect((await remove(item)).statusCode).toBe(200);
      expect(
        (
          await session.injectAs(GM, {
            method: "DELETE",
            url: `/api/v1/campaigns/${ID.campaign}/features/${feature.id}?expectedAssetVersion=${feature.assetVersion}`,
          })
        ).statusCode,
      ).toBe(200);
    });

    it("lets global classes refer to active global assets only", async () => {
      const own = await createFeature();
      const global = await createSystemFeature();

      expect(
        (
          await create(
            { ...BARBARIAN, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset], progressionTracks: [rages], levels: levelsWith({ 1: [rageGrant(own.assetId)] }) },
            ADMIN,
            systemUrl,
          )
        ).statusCode,
      ).toBe(404);

      // A feature for 2024 only does not fit a class that is also meant for 2014.
      expect(
        (
          await create(
            { ...BARBARIAN, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset, ID.otherRuleset], progressionTracks: [rages], levels: levelsWith({ 1: [rageGrant(global.assetId)] }) },
            ADMIN,
            systemUrl,
          )
        ).statusCode,
      ).toBe(409);

      await createSystem({ progressionTracks: [rages], levels: levelsWith({ 1: [rageGrant(global.assetId)] }), startingEquipment: [
        { code: "kit", name: "Kit", optionType: "EQUIPMENT", displayOrder: 0, entries: [{ entryType: "FIXED_ITEM", itemAssetId: ID.systemAxe }] },
      ] });
    });
  });

  describe("global classes and the catalog", () => {
    it("lets only administrators write global classes", async () => {
      const item = await createSystem();

      expect(item).toMatchObject({ scope: "SYSTEM", campaignId: null, rulesetIds: [ID.ruleset] });
      expect((await create(BARBARIAN, GM, systemUrl)).statusCode).toBe(403);
      expect((await update(item, { displayOrder: 3 }, GM)).statusCode).toBe(403);
      expect((await remove(item, GM)).statusCode).toBe(403);
      expect(
        (await session.injectAs(GM, { method: "POST", url: `${systemUrl}/${item.id}/validate` })).statusCode,
      ).toBe(403);
      // Custom routes do not reach global classes.
      expect((await get(`${campaignUrl()}/${item.id}`)).statusCode).toBe(404);
      expect((await update(item, { displayOrder: 3 }, ADMIN)).statusCode).toBe(200);
    });

    it("keeps global codes unique per ruleset, not across rulesets", async () => {
      await createSystem();
      await createSystem({}, [ID.otherRuleset]);

      expect((await create({ ...BARBARIAN, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] }, ADMIN, systemUrl)).statusCode).toBe(409);
      // Neutral would cover both rulesets.
      expect((await create({ ...BARBARIAN, rulesetPolicy: "NEUTRAL" }, ADMIN, systemUrl)).statusCode).toBe(409);
      expect(await classCount()).toBe(2);
    });

    it("offers active global classes for the campaign ruleset next to the campaign's own", async () => {
      const current = await createSystem();
      await createSystem({}, [ID.otherRuleset]);
      await createSystem({ name: "Wizard", hitDie: "D6", status: "DRAFT" });
      const custom = await createOk({ name: "Blood Hunter", hitDie: "D10" });

      const catalog = (await get(catalogUrl())).json();

      expect(catalog.data.map((item: ClassBody) => item.id).sort()).toEqual([current.id, custom.id].sort());
      expect((await get(`${catalogUrl()}?scope=SYSTEM`)).json().data).toHaveLength(1);
      expect((await get(`${catalogUrl()}?hitDie=D10`)).json().data).toEqual([
        expect.objectContaining({ id: custom.id, spellcastingType: "NONE" }),
      ]);
      expect((await get(`${catalogUrl()}?spellcastingType=FULL`)).json().data).toHaveLength(0);
      expect((await get(`${catalogUrl()}?search=hunt`)).json().data).toHaveLength(1);

      // Everybody may read active global classes outside a campaign; drafts only administrators.
      expect((await get(systemUrl, PLAYER)).json().data).toHaveLength(2);
      expect((await get(systemUrl, ADMIN)).json().data).toHaveLength(3);
      expect((await get(`${systemUrl}?rulesetId=${ID.otherRuleset}`, PLAYER)).json().data).toHaveLength(1);
    });

    it("hides global classes of another ruleset from the campaign", async () => {
      const other = await createSystem({}, [ID.otherRuleset]);

      expect((await get(`${catalogUrl()}/${other.id}`)).statusCode).toBe(404);
    });
  });

  describe("players", () => {
    it("see global classes and released custom classes in the player view", async () => {
      const global = await createSystem();
      const custom = await createOk({ name: "Blood Hunter", startingEquipment: [
        { code: "kit", name: "Kit", optionType: "EQUIPMENT", displayOrder: 0, entries: [{ entryType: "FIXED_ITEM", itemAssetId: ID.axe }] },
      ] });

      expect((await get(catalogUrl(), PLAYER)).json().data.map((item: ClassBody) => item.id)).toEqual([global.id]);
      expect((await get(`${catalogUrl()}/${custom.id}`, PLAYER)).statusCode).toBe(404);
      expect((await create(BARBARIAN, PLAYER)).statusCode).toBe(403);

      const released = await update(custom, { releasedToPlayers: true });

      expect(released.statusCode).toBe(200);

      const view = await get(`${catalogUrl()}/${custom.id}`, PLAYER);

      expect(view.statusCode).toBe(200);
      expect(view.json()).toMatchObject({ view: "PLAYER", name: "Blood Hunter" });
      expect(view.json()).not.toHaveProperty("rulesetIds");
      expect(view.json()).not.toHaveProperty("releasedToPlayers");
      expect(view.json()).not.toHaveProperty("version");
      // The custom item is not released, so the player does not learn about it.
      expect((view.json() as ClassBody).startingEquipment[0]?.entries[0]?.itemAssetId).toBeNull();
      expect((await get(catalogUrl(), PLAYER)).json().data).toHaveLength(2);
    });

    it("see custom features through a released class that grants them", async () => {
      const feature = await createFeature();
      const item = await createOk({
        progressionTracks: [rages],
        levels: levelsWith({ 1: [rageGrant(feature.assetId)] }),
      });
      const featureUrl = `/api/v1/campaigns/${ID.campaign}/catalog/features/${feature.id}`;

      expect((await get(featureUrl, PLAYER)).statusCode).toBe(404);

      await update(item, { releasedToPlayers: true });

      expect((await get(featureUrl, PLAYER)).statusCode).toBe(200);

      const features = (await get(`${catalogUrl()}/${item.id}/features`, PLAYER)).json();

      expect(features).toMatchObject({ view: "PLAYER", grants: [expect.objectContaining({ level: 1, key: "rage" })] });
    });
  });

  describe("catalog sections", () => {
    it("returns progression, features, choices, spellcasting, proficiencies, equipment and multiclass", async () => {
      const feature = await createFeature();
      const item = await createOk({
        progressionTracks: [rages],
        levels: levelsWith({ 1: [rageGrant(feature.assetId)] }),
        proficiencies: [
          { key: "saves", acquisitionMode: "STARTING_CLASS", proficiencyType: "SAVING_THROW", selectionMode: "FIXED", displayOrder: 0, options: [{ code: "str" }, { code: "con" }] },
          { key: "shields", acquisitionMode: "MULTICLASS", proficiencyType: "ARMOR", selectionMode: "FIXED", displayOrder: 1, options: [{ code: "shield" }] },
        ],
        startingEquipment: [{ code: "gold", name: "Gold", optionType: "CURRENCY", currencyAmount: 75, currencyCode: "GP", displayOrder: 0 }],
      });
      const section = async (name: string) => {
        const response = await get(`${catalogUrl()}/${item.id}/${name}`);

        expect(response.statusCode).toBe(200);

        return response.json();
      };

      const progression = await section("progression");

      expect(progression.levels).toHaveLength(20);
      expect(progression.levels[0]).toEqual({
        level: 1,
        values: [{ trackKey: "rages", value: 2 }],
        featureGrantKeys: ["rage"],
        choiceKeys: [],
      });
      expect(progression.levels[2].choiceKeys).toEqual(["subclass"]);
      expect((await section("features")).grants).toEqual([expect.objectContaining({ level: 1, featureAssetId: feature.assetId })]);
      expect(await section("choices")).toMatchObject({ subclassSelectionLevel: 3, choices: [expect.objectContaining({ key: "subclass" })] });
      expect(await section("spellcasting")).toMatchObject({ spellcasting: null });
      expect((await section("proficiencies")).startingClass).toHaveLength(1);
      expect((await section("starting-equipment")).options).toEqual([expect.objectContaining({ currencyAmount: 75 })]);
      expect(await section("multiclass")).toMatchObject({
        combinationMode: "ALL",
        abilityRequirements: [{ ability: "str", minimum: 13 }],
        proficiencies: [expect.objectContaining({ key: "shields" })],
      });
      expect((await get(`${catalogUrl()}/${item.id}/usages`)).statusCode).toBe(200);
    });

    it("validates stored definitions on request", async () => {
      const item = await createOk();
      const response = await session.injectAs(EDITOR, { method: "POST", url: `${itemUrl(item)}/validate` });

      expect(response.json()).toEqual({ classId: item.id, valid: true, issues: [] });
      expect((await session.injectAs(PLAYER, { method: "POST", url: `${itemUrl(item)}/validate` })).statusCode).toBe(403);
    });
  });

  describe("database", () => {
    it("allows one active class per asset and only valid values", async () => {
      const item = await createOk();
      const [row] = await db.select().from(classes).where(eq(classes.id, item.id));
      const copy = { ...row!, id: undefined, version: 1 };

      await expect(db.insert(classes).values({ ...copy, code: "other" })).rejects.toMatchObject({
        cause: expect.objectContaining({ code: "23505" }),
      });
      await expect(
        db.insert(classes).values({ ...copy, assetId: ID.axe, code: "Bad Code" }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
      await expect(
        db.insert(classes).values({ ...copy, assetId: ID.axe, code: "x", levels: [] }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
      await expect(
        db.insert(classes).values({ ...copy, assetId: ID.axe, code: "x", subclassSelectionLevel: 21 }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
      await expect(
        db.insert(classes).values({ ...copy, assetId: ID.foreignAxe, code: "x" }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23503" }) });
    });
  });
});
