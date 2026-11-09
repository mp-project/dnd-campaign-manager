import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { assets, campaignMemberships, campaigns, rulesets, spells, users } from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset: "10000000-0000-4000-8000-000000002024",
  oldRuleset: "10000000-0000-4000-8000-000000002014",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  editor: "a0000000-0000-4000-8000-000000000004",
  outsider: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  admin: "a0000000-0000-4000-8000-000000000007",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  oldCampaign: "c0000000-0000-4000-8000-00000000000c",
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

type SpellBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  campaignId: string | null;
  status: string;
  code: string;
  name: string;
  level: number;
  selectable: boolean;
  descriptionHtml: string | null;
  sections: { key: string; contentHtml: string }[];
  choices: { key: string; options: { code: string }[] }[];
  spellListIds: string[];
  releasedToPlayers?: boolean;
  rulesetIds?: string[];
  merged?: string[];
};

type SpellListBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  campaignId: string | null;
  status: string;
  code: string;
  spellIds: string[];
};

type Page<T> = { data: T[]; pageInfo: { nextCursor: string | null } };

/** Fire Bolt: a cantrip whose damage dice grow with the character level. */
const FIRE_BOLT = {
  name: "Fire Bolt",
  level: 0,
  school: "EVOCATION",
  castingTimeType: "ACTION",
  rangeType: "DISTANCE",
  rangeDistance: 120,
  rangeUnit: "FEET",
  durationType: "INSTANTANEOUS",
  componentVerbal: true,
  componentSomatic: true,
  description: "A mote of **fire** <script>alert(1)</script>",
  targets: [{ key: "target", targetType: "CREATURE", minimumCount: 1, maximumCount: 1 }],
  scalingTracks: [
    {
      key: "damage",
      scaleBy: "CHARACTER_LEVEL",
      valueType: "DIE",
      values: [
        { minimumLevel: 1, value: { count: 1, faces: 10 } },
        { minimumLevel: 5, value: { count: 2, faces: 10 } },
        { minimumLevel: 11, value: { count: 3, faces: 10 } },
        { minimumLevel: 17, value: { count: 4, faces: 10 } },
      ],
    },
  ],
  effects: [
    {
      key: "hit",
      targetKey: "target",
      resolution: "RANGED_SPELL_ATTACK",
      payload: { type: "DAMAGE", damageType: "fire", dice: { ref: "scale.damage" } },
      displayOrder: 0,
    },
  ],
};

/** Fireball: 8d6 plus 1d6 per slot level above 3rd, half on a successful save. */
const FIREBALL = {
  name: "Fireball",
  level: 3,
  school: "EVOCATION",
  castingTimeType: "ACTION",
  rangeType: "DISTANCE",
  rangeDistance: 150,
  rangeUnit: "FEET",
  durationType: "INSTANTANEOUS",
  componentVerbal: true,
  componentSomatic: true,
  componentMaterial: true,
  materials: [{ description: "A ball of bat guano and sulfur", replaceableByFocus: true }],
  targets: [
    { key: "blast", targetType: "AREA", area: { shape: "SPHERE", size: 20, unit: "FEET" } },
  ],
  effects: [
    {
      key: "burn",
      targetKey: "blast",
      resolution: "SAVING_THROW",
      saveAbility: "dex",
      onSave: "HALF",
      payload: {
        type: "DAMAGE",
        damageType: "fire",
        dice: { count: { type: "ADD", args: [{ type: "CONST", value: 8 }, { type: "VAR", key: "slot.above" }] }, faces: 6 },
      },
      displayOrder: 0,
    },
  ],
};

/** Shield: a reaction with a trigger. */
const SHIELD = {
  name: "Shield",
  level: 1,
  school: "ABJURATION",
  castingTimeType: "REACTION",
  castingTrigger: "When you are hit by an attack roll or targeted by Magic Missile",
  rangeType: "SELF",
  rangeDistance: null,
  rangeUnit: null,
  durationType: "TIMED",
  durationAmount: 1,
  durationUnit: "ROUND",
  componentVerbal: true,
  componentSomatic: true,
  targets: [{ key: "self", targetType: "SELF" }],
  scalingTracks: [],
  effects: [
    {
      key: "ac",
      payload: { type: "MODIFIER", stat: "ac", amount: { type: "CONST", value: 5 } },
      displayOrder: 0,
    },
  ],
};

describe("spells", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/spells`;
  const catalogUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/catalog/spells`;
  const systemUrl = "/api/v1/spells";
  const listCampaignUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/spell-lists`;
  const listCatalogUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/catalog/spell-lists`;
  const listSystemUrl = "/api/v1/spell-lists";

  const inject = (as: TestActor, method: string, url: string, payload?: unknown) =>
    session.injectAs(as, {
      method: method as "GET",
      url,
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  const expectStatus = async <T>(response: Awaited<ReturnType<typeof inject>>, status: number) => {
    expect({ status: response.statusCode, body: response.statusCode === status ? null : response.json() }).toEqual({
      status,
      body: null,
    });

    return response.json() as T;
  };

  const create = (payload: Record<string, unknown> = {}, as: TestActor = GM, url = campaignUrl()) =>
    inject(as, "POST", url, { ...FIRE_BOLT, ...payload });

  const createOk = async (payload: Record<string, unknown> = {}, as: TestActor = GM, url = campaignUrl()) =>
    expectStatus<SpellBody>(await create(payload, as, url), 201);

  const createSystem = (payload: Record<string, unknown> = {}, rulesetIds: string[] = [ID.ruleset]) =>
    createOk({ rulesetPolicy: "RESTRICTED", rulesetIds, ...payload }, ADMIN, systemUrl);

  const createList = async (
    payload: Record<string, unknown> = {},
    as: TestActor = GM,
    url = listCampaignUrl(),
  ) => expectStatus<SpellListBody>(await inject(as, "POST", url, { name: "Wizard", ...payload }), 201);

  const itemUrl = (item: { id: string; campaignId: string | null }) =>
    item.campaignId ? `${campaignUrl(item.campaignId)}/${item.id}` : `${systemUrl}/${item.id}`;

  const listItemUrl = (item: { id: string; campaignId: string | null }) =>
    item.campaignId ? `${listCampaignUrl(item.campaignId)}/${item.id}` : `${listSystemUrl}/${item.id}`;

  const versions = (item: { version: number; assetVersion: number }) => ({
    expectedVersion: item.version,
    expectedAssetVersion: item.assetVersion,
  });

  const update = (item: SpellBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", itemUrl(item), { ...versions(item), ...payload });

  const remove = (url: string, item: { assetVersion: number }, as: TestActor = GM) =>
    inject(as, "DELETE", `${url}?expectedAssetVersion=${item.assetVersion}`);

  const restore = (url: string, item: { assetVersion: number }, as: TestActor = GM) =>
    inject(as, "POST", `${url}/restore`, { expectedAssetVersion: item.assetVersion });

  const names = async (url: string, as: TestActor = GM) =>
    (await expectStatus<Page<SpellBody>>(await inject(as, "GET", url), 200)).data.map((item) => item.name);

  const spellAssetCount = async () =>
    (await db.select().from(assets).where(eq(assets.assetType, "SPELL"))).length;

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "SPELLS_2024", editionYear: 2024 },
        { id: ID.oldRuleset, code: "SPELLS_2014", editionYear: 2014 },
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
        { id: ID.campaign, ownerUserId: ID.gm, slug: "own", rulesetId: ID.ruleset },
        { id: ID.foreignCampaign, ownerUserId: ID.foreignGm, slug: "foreign", rulesetId: ID.ruleset },
        { id: ID.oldCampaign, ownerUserId: ID.gm, slug: "old", rulesetId: ID.oldRuleset },
      ].map((campaign) => ({
        ...campaign,
        name: "Campaign",
        status: "ACTIVE" as const,
        createdBy: campaign.ownerUserId,
      })),
    );
    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.editor, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.oldCampaign, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.foreignCampaign, userId: ID.foreignGm, role: "EDITOR", createdBy: ID.foreignGm },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("custom spells", () => {
    it("creates asset and spell in one go and renders text harmless", async () => {
      const item = await createOk({
        sections: [{ key: "notes", title: "Notes", content: "*Hot*", displayOrder: 0 }],
      });

      expect(item).toMatchObject({
        view: "FULL",
        campaignId: ID.campaign,
        name: "Fire Bolt",
        code: "fire-bolt",
        level: 0,
        status: "ACTIVE",
        selectable: true,
        releasedToPlayers: false,
        spellListIds: [],
      });
      expect(item.descriptionHtml).toContain("<strong>fire</strong>");
      expect(item.descriptionHtml).not.toContain("<script");
      expect(item.sections[0]?.contentHtml).toContain("<em>Hot</em>");
      expect(item).not.toHaveProperty("slots");

      const read = await expectStatus<SpellBody>(await inject(EDITOR, "GET", itemUrl(item)), 200);

      expect(read.view).toBe("FULL");
    });

    it("refuses invalid bodies, missing rights and other campaigns", async () => {
      // Level, casting time, range, duration and components each have their rules.
      expect((await create({ level: 10 })).statusCode).toBe(400);
      expect((await create({ school: "CHRONOMANCY" })).statusCode).toBe(400);
      expect((await create({ castingTimeType: "REACTION" })).statusCode).toBe(400);
      expect((await create({ rangeType: "SELF" })).statusCode).toBe(400);
      expect((await create({ durationType: "TIMED" })).statusCode).toBe(400);
      expect((await create({ componentMaterial: true })).statusCode).toBe(400);
      expect((await create({ isRitual: true })).statusCode).toBe(400);
      expect((await create({ description: null, effects: [] })).statusCode).toBe(400);
      expect((await create({}, PLAYER)).statusCode).toBe(403);
      expect((await create({}, OUTSIDER)).statusCode).toBe(404);

      const item = await createOk();

      expect((await inject(FOREIGN_GM, "GET", itemUrl(item))).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${campaignUrl(ID.foreignCampaign)}/${item.id}`)).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${campaignUrl()}/${ID.unknown}`)).statusCode).toBe(404);
      expect((await create({ name: "Other", code: "fire-bolt" })).statusCode).toBe(409);
    });

    it("updates with versions, checks the merged state, reports conflicts and keeps a history", async () => {
      const item = await createOk();
      // A reaction needs its trigger in the same change.
      expect((await update(item, { castingTimeType: "REACTION" })).statusCode).toBe(400);

      const updated = await expectStatus<SpellBody>(
        await update(item, { name: "Fire Bolt!", castingTimeType: "BONUS_ACTION" }),
        200,
      );

      expect(updated).toMatchObject({ name: "Fire Bolt!", merged: [] });
      // The definition is one unit: a stale change to a part conflicts with the change above; an
      // unrelated field from the same stale version is merged.
      expect((await update(item, { effects: [] })).statusCode).toBe(412);
      expect((await update(item, { higherLevelDescription: "Merged" })).statusCode).toBe(200);
      // The description belongs to the group too ("a description, a section or an effect").
      expect((await update(item, { description: null })).statusCode).toBe(412);
      expect((await update(updated, { description: "x" }, PLAYER)).statusCode).toBe(403);

      const history = await expectStatus<{ data: { field: string }[] }>(
        await inject(GM, "GET", `/api/v1/history/spell/${item.id}`),
        200,
      );

      expect(history.data.map((entry) => entry.field)).toEqual(expect.arrayContaining(["castingTimeType"]));
      expect((await inject(PLAYER, "GET", `/api/v1/history/spell/${item.id}`)).statusCode).toBe(404);
    });

    it("archives softly and restores; archived spells cannot be changed", async () => {
      const item = await createOk();
      const archived = await expectStatus<SpellBody>(await remove(itemUrl(item), item), 200);

      expect(archived).toMatchObject({ status: "ARCHIVED", selectable: false });
      expect((await update(archived, { description: "x" })).statusCode).toBe(409);
      expect(await names(campaignUrl())).toEqual([]);
      expect(await names(`${campaignUrl()}?status=ARCHIVED`)).toEqual(["Fire Bolt"]);
      expect((await db.select().from(spells)).map((row) => row.deletedAt)).toEqual([null]);

      const restored = await expectStatus<SpellBody>(await restore(itemUrl(item), archived), 200);

      expect(restored.status).toBe("ACTIVE");
    });

    it("rolls the whole action back when a reference is missing", async () => {
      expect((await create({ spellListIds: [ID.unknown] })).statusCode).toBe(404);
      expect(await spellAssetCount()).toBe(0);
      expect((await db.select().from(spells)).length).toBe(0);
    });

    it("refuses rows that break a check constraint", async () => {
      const item = await createOk();

      await expect(
        db.update(spells).set({ castingTimeType: "REACTION" }).where(eq(spells.id, item.id)),
      ).rejects.toThrow();
      await expect(db.update(spells).set({ level: 12 }).where(eq(spells.id, item.id))).rejects.toThrow();
      await expect(
        db.update(spells).set({ componentMaterial: true }).where(eq(spells.id, item.id)),
      ).rejects.toThrow();
    });
  });

  describe("global spells", () => {
    it("are changed by administrators only and keep codes unique per ruleset", async () => {
      expect((await create({}, GM, systemUrl)).statusCode).toBe(403);

      const modern = await createSystem();

      expect(modern).toMatchObject({ campaignId: null, rulesetIds: [ID.ruleset] });
      expect(
        (await create({ rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] }, ADMIN, systemUrl)).statusCode,
      ).toBe(409);
      expect((await createSystem({}, [ID.oldRuleset])).code).toBe("fire-bolt");

      const asPlayer = await expectStatus<SpellBody>(await inject(PLAYER, "GET", itemUrl(modern)), 200);

      expect(asPlayer.view).toBe("PLAYER");
      expect((await update(modern, { description: "x" }, GM)).statusCode).toBe(403);
    });
  });

  describe("catalog and player view", () => {
    it("shows players global spells of the ruleset and released custom ones", async () => {
      const global = await createSystem({ name: "Global" });
      await createSystem({ name: "Old" }, [ID.oldRuleset]);
      const custom = await createOk({ name: "Custom" });

      expect(await names(catalogUrl(), PLAYER)).toEqual(["Global"]);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${custom.id}`)).statusCode).toBe(404);

      await expectStatus(await update(custom, { releasedToPlayers: true }), 200);

      expect(await names(catalogUrl(), PLAYER)).toEqual(["Custom", "Global"]);

      const view = await expectStatus<SpellBody>(await inject(PLAYER, "GET", `${catalogUrl()}/${global.id}`), 200);

      expect(view.view).toBe("PLAYER");
      expect(view).not.toHaveProperty("releasedToPlayers");
      expect(view).not.toHaveProperty("rulesetIds");
    });

    it("filters by level, school, ritual, concentration, component and effect", async () => {
      await createOk();
      await createOk(FIREBALL);
      await createOk(SHIELD);
      await createOk({
        name: "Detect Magic",
        level: 1,
        school: "DIVINATION",
        isRitual: true,
        requiresConcentration: true,
        durationType: "TIMED",
        durationAmount: 10,
        durationUnit: "MINUTE",
        rangeType: "SELF",
        rangeDistance: null,
        rangeUnit: null,
        targets: [],
        scalingTracks: [],
        effects: [],
        description: "Sense magic",
      });

      expect(await names(`${catalogUrl()}?level=3`)).toEqual(["Fireball"]);
      expect(await names(`${catalogUrl()}?maxLevel=1`)).toEqual(["Fire Bolt", "Detect Magic", "Shield"]);
      expect(await names(`${catalogUrl()}?school=ABJURATION`)).toEqual(["Shield"]);
      expect(await names(`${catalogUrl()}?ritual=true`)).toEqual(["Detect Magic"]);
      expect(await names(`${catalogUrl()}?concentration=false&level=1`)).toEqual(["Shield"]);
      expect(await names(`${catalogUrl()}?component=MATERIAL`)).toEqual(["Fireball"]);
      expect(await names(`${catalogUrl()}?effect=MODIFIER`)).toEqual(["Shield"]);
      expect(await names(`${catalogUrl()}?effect=DAMAGE`)).toEqual(["Fire Bolt", "Fireball"]);

      const first = await expectStatus<Page<SpellBody>>(await inject(GM, "GET", `${catalogUrl()}?limit=2`), 200);

      expect(first.data.map((item) => item.name)).toEqual(["Fire Bolt", "Detect Magic"]);
      expect(
        await names(`${catalogUrl()}?limit=2&cursor=${first.pageInfo.nextCursor}`),
      ).toEqual(["Shield", "Fireball"]);
    });

    it("shows targets, effects and scaling as a section", async () => {
      const item = await createOk(FIREBALL);
      const section = await expectStatus<{ level: number; targets: { key: string }[]; effects: { key: string }[] }>(
        await inject(GM, "GET", `${catalogUrl()}/${item.id}/effects`),
        200,
      );

      expect(section).toMatchObject({ level: 3, targets: [{ key: "blast" }], effects: [{ key: "burn" }] });
    });
  });

  describe("spell lists", () => {
    it("contain their own entries and the spells that name them, per campaign", async () => {
      const fireBolt = await createSystem();
      const fireball = await createSystem(FIREBALL);
      const wizard = await createList(
        { rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset], spellIds: [fireBolt.assetId] },
        ADMIN,
        listSystemUrl,
      );
      // A custom spell joins the global list for its campaign only.
      const custom = await createOk({ ...SHIELD, spellListIds: [wizard.assetId] });

      await createOk({ ...SHIELD, spellListIds: [wizard.assetId] }, FOREIGN_GM, campaignUrl(ID.foreignCampaign));

      expect(await names(`${catalogUrl()}?list=${wizard.id}`)).toEqual(["Fire Bolt", "Shield"]);
      expect(await names(`${listCatalogUrl()}/${wizard.id}/spells`)).toEqual(["Fire Bolt", "Shield"]);
      expect(await names(`${listCatalogUrl()}/${wizard.id}/spells?level=0`)).toEqual(["Fire Bolt"]);
      expect(await names(`${catalogUrl()}?list=${wizard.id}&level=3`)).toEqual([]);
      expect(fireball.level).toBe(3);

      const lists = await expectStatus<{ lists: { assetId: string; membership: string }[] }>(
        await inject(GM, "GET", `${catalogUrl()}/${custom.id}/lists`),
        200,
      );

      expect(lists.lists).toEqual([expect.objectContaining({ assetId: wizard.assetId, membership: "NAMED_BY_SPELL" })]);
      expect((await inject(GM, "GET", `${catalogUrl()}?list=${ID.unknown}`)).statusCode).toBe(404);
    });

    it("check entries by type, campaign and ruleset", async () => {
      const feature = await expectStatus<{ assetId: string }>(
        await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/features`, { name: "Tough", featureType: "PASSIVE" }),
        201,
      );
      const foreign = await createOk({}, FOREIGN_GM, campaignUrl(ID.foreignCampaign));
      const old = await createSystem({ name: "Old" }, [ID.oldRuleset]);

      expect((await inject(GM, "POST", listCampaignUrl(), { name: "L", spellIds: [feature.assetId] })).statusCode).toBe(409);
      expect((await inject(GM, "POST", listCampaignUrl(), { name: "L", spellIds: [foreign.assetId] })).statusCode).toBe(404);
      expect((await inject(GM, "POST", listCampaignUrl(), { name: "L", spellIds: [old.assetId] })).statusCode).toBe(409);
      expect(
        (await inject(GM, "POST", listCampaignUrl(), { name: "L", spellIds: [ID.unknown, ID.unknown] })).statusCode,
      ).toBe(400);
    });

    it("keep listed spells and named lists from being archived and show them as usages", async () => {
      const spell = await createOk();
      const list = await createList({ spellIds: [spell.assetId] });
      const naming = await createOk({ ...SHIELD, spellListIds: [list.assetId] });

      expect((await remove(itemUrl(spell), spell)).statusCode).toBe(409);
      expect((await remove(listItemUrl(list), list)).statusCode).toBe(409);

      const usages = await expectStatus<{ typedUsages: { type: string; label: string }[] }>(
        await inject(GM, "GET", `${itemUrl(spell)}/usages`),
        200,
      );

      expect(usages.typedUsages).toEqual([expect.objectContaining({ type: "SPELL_LIST_ENTRY", label: "Wizard" })]);

      const listUsages = await expectStatus<{ typedUsages: { type: string }[] }>(
        await inject(GM, "GET", `${listItemUrl(list)}/usages`),
        200,
      );

      expect(listUsages.typedUsages.map((usage) => usage.type)).toEqual(["SPELL_LIST"]);

      await expectStatus(await remove(itemUrl(naming), naming), 200);

      const current = await expectStatus<SpellListBody>(await inject(GM, "GET", listItemUrl(list)), 200);
      const emptied = await expectStatus<SpellListBody & { merged: string[] }>(
        await inject(GM, "PATCH", listItemUrl(list), { ...versions(current), spellIds: [] }),
        200,
      );

      expect(emptied.spellIds).toEqual([]);
      expect((await remove(itemUrl(spell), spell)).statusCode).toBe(200);
      expect((await remove(listItemUrl(emptied), emptied)).statusCode).toBe(200);
    });

    it("make custom spells visible to players through a released list", async () => {
      const hidden = await createOk({ name: "Hidden" });
      const listed = await createOk({ ...FIREBALL });
      const list = await createList({ releasedToPlayers: true, spellIds: [listed.assetId] });

      const view = await expectStatus<SpellListBody>(
        await inject(PLAYER, "GET", `${listCatalogUrl()}/${list.id}`),
        200,
      );

      expect(view).toMatchObject({ view: "PLAYER", spellIds: [listed.assetId] });
      expect(await names(`${listCatalogUrl()}/${list.id}/spells`, PLAYER)).toEqual(["Fireball"]);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${hidden.id}`)).statusCode).toBe(404);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${listed.id}`)).statusCode).toBe(200);

      // A custom spell that names the released list belongs to it, for players as well.
      const naming = await createOk({ ...SHIELD, spellListIds: [list.assetId] });

      expect(await names(`${listCatalogUrl()}/${list.id}/spells`, PLAYER)).toEqual(["Shield", "Fireball"]);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${naming.id}`)).statusCode).toBe(200);
    });

    it("refuse narrowing a spell's rulesets while a list that holds it needs them", async () => {
      const spell = await createSystem({}, [ID.ruleset, ID.oldRuleset]);
      await createList(
        { rulesetPolicy: "RESTRICTED", rulesetIds: [ID.oldRuleset], spellIds: [spell.assetId] },
        ADMIN,
        listSystemUrl,
      );

      const narrowed = await update(spell, { rulesetIds: [ID.ruleset] }, ADMIN);

      expect(narrowed.statusCode).toBe(409);
      expect(JSON.stringify(narrowed.json())).toContain("no longer fits");
      expect((await update(spell, { rulesetIds: [ID.oldRuleset] }, ADMIN)).statusCode).toBe(200);
    });

    it("filter the catalog by the spell list of a class", async () => {
      const spell = await createOk();
      await createOk(SHIELD);
      const list = await createList({ spellIds: [spell.assetId] });
      const sorcerer = await expectStatus<{ id: string; assetVersion: number }>(
        await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/classes`, {
          name: "Sorcerer",
          hitDie: "D6",
          firstLevelHitPoints: 6,
          fixedHitPointsPerLevel: 4,
          subclassSelectionLevel: 1,
          primaryAbilities: { combinationMode: "ALL", abilities: ["cha"] },
          choices: [
            {
              key: "subclass",
              level: 1,
              choiceType: "SUBCLASS",
              minimumSelections: 1,
              maximumSelections: 1,
              optionFilter: { assetTypes: ["SUBCLASS"] },
              displayOrder: 0,
            },
          ],
          spellcasting: {
            castingType: "FULL",
            spellcastingAbility: "cha",
            unlockLevel: 1,
            preparationMode: "KNOWN",
            spellListAssetId: list.assetId,
            multiclassNumerator: 1,
            multiclassDenominator: 1,
            multiclassRounding: "DOWN",
          },
        }),
        201,
      );

      expect(await names(`${catalogUrl()}?class=${sorcerer.id}`)).toEqual(["Fire Bolt"]);

      // A player may read the released class but not its unreleased list: no spells, no 404.
      const released = await expectStatus<{ id: string; version: number; assetVersion: number }>(
        await inject(GM, "GET", `/api/v1/campaigns/${ID.campaign}/classes/${sorcerer.id}`),
        200,
      );

      await expectStatus(
        await inject(GM, "PATCH", `/api/v1/campaigns/${ID.campaign}/classes/${sorcerer.id}`, {
          ...versions(released),
          releasedToPlayers: true,
        }),
        200,
      );
      expect(await names(`${catalogUrl()}?class=${sorcerer.id}`, PLAYER)).toEqual([]);
      expect((await inject(GM, "GET", `${catalogUrl()}?class=${ID.unknown}`)).statusCode).toBe(404);
      // The class keeps its list from being archived.
      const current = await expectStatus<SpellListBody>(await inject(GM, "GET", listItemUrl(list)), 200);

      expect((await remove(listItemUrl(current), current)).statusCode).toBe(409);
    });
  });

  describe("resolution", () => {
    it("scales cantrips by character level and slot spells by slot level without spending anything", async () => {
      const fireBolt = await createOk({ releasedToPlayers: true });
      const fireball = await createOk(FIREBALL);
      const resolve = (item: SpellBody, body: Record<string, unknown>, as: TestActor = GM) =>
        inject(as, "POST", `${catalogUrl()}/${item.id}/resolve`, body);

      const cantrip = await expectStatus<{
        slotLevel: number | null;
        effects: { payload: { dice: { count: number; faces: number } } }[];
        uses: { slotLevel: number | null };
      }>(await resolve(fireBolt, { characterLevel: 11 }, PLAYER), 200);

      expect(cantrip.slotLevel).toBeNull();
      expect(cantrip.uses.slotLevel).toBeNull();
      expect(cantrip.effects[0]?.payload.dice).toEqual({ count: 3, faces: 10 });

      const upcast = await expectStatus<{
        slotLevel: number;
        effects: { resolution: string; saveAbility: string; onSave: string; payload: { dice: { count: number } } }[];
        uses: { startsConcentration: boolean; consumedMaterials: unknown[] };
      }>(await resolve(fireball, { slotLevel: 5, caster: { saveDc: 15 } }), 200);

      expect(upcast.slotLevel).toBe(5);
      expect(upcast.effects[0]).toMatchObject({ resolution: "SAVING_THROW", saveAbility: "dex", onSave: "HALF" });
      expect(upcast.effects[0]?.payload.dice.count).toBe(10);
      expect(upcast.uses).toEqual({ slotLevel: 5, canBeCastAsRitual: false, startsConcentration: false, consumedMaterials: [] });

      expect((await resolve(fireball, { slotLevel: 2 })).statusCode).toBe(409);
      expect((await resolve(fireBolt, { slotLevel: 1 })).statusCode).toBe(409);
      expect((await resolve(fireball, { slotLevel: 10 })).statusCode).toBe(400);
      expect((await resolve(fireball, {}, PLAYER)).statusCode).toBe(404);
    });
  });

  describe("validate", () => {
    it("reports the issues of a stored definition", async () => {
      const item = await createOk();

      await db.update(spells).set({ effects: [{ key: "Bad" }] }).where(eq(spells.id, item.id));

      const result = await expectStatus<{ valid: boolean; issues: unknown[] }>(
        await inject(GM, "POST", `${itemUrl(item)}/validate`),
        200,
      );

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect((await inject(GM, "GET", `${catalogUrl()}/${item.id}/effects`)).statusCode).toBe(409);
      expect((await inject(PLAYER, "POST", `${itemUrl(item)}/validate`)).statusCode).toBe(403);
    });
  });
});
