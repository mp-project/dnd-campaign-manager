import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assets,
  campaignMemberships,
  campaigns,
  entityChangeEvents,
  itemInstanceKnowledge,
  itemInstances,
  items,
  rulesets,
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
  hero: "d0000000-0000-4000-8000-0000000000a1",
  sidekick: "d0000000-0000-4000-8000-0000000000a2",
  tavern: "d0000000-0000-4000-8000-0000000000a3",
  foreignHero: "d0000000-0000-4000-8000-0000000000a4",
  unknown: "f0000000-0000-4000-8000-00000000000f",
} as const;

const actor = (actorId: string, systemRole: TestActor["systemRole"] = "USER"): TestActor => ({ actorId, systemRole });

const GM = actor(ID.gm);
const EDITOR = actor(ID.editor);
const PLAYER = actor(ID.player);
const OTHER_PLAYER = actor(ID.otherPlayer);
const OUTSIDER = actor(ID.outsider);
const FOREIGN_GM = actor(ID.foreignGm);
const ADMIN = actor(ID.admin, "ADMIN");

type ItemBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  campaignId: string | null;
  status: string;
  code: string;
  name: string;
  category: string;
  gmNotes?: string | null;
  descriptionHtml: string | null;
  forkedFromAssetId?: string | null;
  featureGrants: { key: string }[];
  spells: { key: string }[];
  merged?: string[];
  [key: string]: unknown;
};

type InstanceBody = {
  view: string;
  id: string;
  version: number;
  quantity: number;
  ownerType: string;
  ownerAssetId: string | null;
  equipped: boolean;
  attuned: boolean;
  currentCharges: number | null;
  name: string | null;
  knowledge?: { userId: string | null; knowledgeLevel: string; version: number }[];
  knowledgeLevel?: string;
  item: Record<string, unknown> | null;
  appearance?: Record<string, unknown>;
  notes?: string | null;
};

type Resolution = {
  state: { functional: boolean; chargesCurrent: number | null };
  weapon: {
    attackAbility: string | null;
    attackBonus: number | null;
    proficient: boolean | null;
    magicBonus: number;
    damage: { dice: { count: number; faces: number } | null; bonus: number | null; damageType: string; twoHanded: boolean };
    reasons: string[];
  } | null;
  armor: { armorClass: number | null; armorClassBonus: number | null; meetsStrengthRequirement: boolean | null; active: boolean } | null;
  effects: { key: string; active: boolean; applies: string }[];
  totals: { modifiers: Record<string, number>; baseValues: Record<string, number>; grants: unknown[] };
  spells: { key: string; available: boolean }[];
  featureGrants: { key: string; active: boolean; resolved: { effects: { payload: { amount: number } }[] } | null }[];
};

type Page<T> = { data: T[]; pageInfo: { nextCursor: string | null } };

/** A +1 rapier: finesse, so the better of Strength and Dexterity. */
const RAPIER = {
  name: "Rapier +1",
  category: "WEAPON",
  weaponCategory: "MARTIAL",
  weaponCombatType: "MELEE",
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageType: "PIERCING",
  weaponProperties: ["FINESSE"],
  isMagical: true,
  magicItemType: "WEAPON",
  rarity: "UNCOMMON",
  magicBonus: 1,
  costAmount: 25,
  costCurrency: "GP",
  weight: 2,
  description: "A **slim** blade <script>alert(1)</script>",
  gmNotes: "Once owned by the duke",
};

const LONGSWORD = {
  name: "Longsword",
  category: "WEAPON",
  weaponCategory: "MARTIAL",
  weaponCombatType: "MELEE",
  damageDiceCount: 1,
  damageDiceFaces: 8,
  damageType: "SLASHING",
  weaponProperties: ["VERSATILE"],
  versatileDiceFaces: 10,
  masteryProperty: "SAP",
};

const HALF_PLATE = {
  name: "Half Plate",
  category: "ARMOR",
  armorCategory: "MEDIUM",
  baseArmorClass: 15,
  dexterityMode: "CAPPED",
  dexterityCap: 2,
  stealthDisadvantage: true,
};

const constant = (value: number) => ({ type: "CONST", value });

/** Gauntlets of Ogre Power: Strength 19 while attuned. */
const GAUNTLETS = {
  name: "Gauntlets of Ogre Power",
  category: "MAGIC_ITEM",
  magicItemType: "WONDROUS_ITEM",
  rarity: "UNCOMMON",
  attunementMode: "REQUIRED",
  effects: [
    { key: "strength", activation: "ATTUNED", payload: { type: "BASE_VALUE", stat: "ability.str", value: constant(19) } },
  ],
};

/** A belt that gives +1 Strength while attuned and +1 armor class while worn. */
const BELT = {
  name: "Belt of Vigor",
  category: "MAGIC_ITEM",
  magicItemType: "WONDROUS_ITEM",
  rarity: "RARE",
  attunementMode: "OPTIONAL",
  effects: [
    { key: "might", activation: "ATTUNED", payload: { type: "MODIFIER", stat: "ability.str", amount: constant(1) } },
    { key: "guard", activation: "EQUIPPED", payload: { type: "MODIFIER", stat: "ac", amount: constant(1) } },
  ],
};

const ARROWS = {
  name: "Arrows",
  category: "ADVENTURING_GEAR",
  isStackable: true,
  consumedOnUse: true,
  weight: 0.05,
};

describe("items", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/items`;
  const catalogUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/catalog/items`;
  const systemUrl = "/api/v1/items";
  const instancesUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/item-instances`;

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

    return (response.statusCode === 204 ? null : response.json()) as T;
  };

  const create = (payload: Record<string, unknown>, as: TestActor = GM, url = campaignUrl()) =>
    inject(as, "POST", url, payload);

  const createOk = async (payload: Record<string, unknown>, as: TestActor = GM, url = campaignUrl()) =>
    expectStatus<ItemBody>(await create(payload, as, url), 201);

  const itemUrl = (item: { id: string; campaignId: string | null }) =>
    item.campaignId ? `${campaignUrl(item.campaignId)}/${item.id}` : `${systemUrl}/${item.id}`;

  const update = (item: ItemBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", itemUrl(item), { expectedVersion: item.version, expectedAssetVersion: item.assetVersion, ...payload });

  const resolve = async (item: { id: string }, body: Record<string, unknown>, as: TestActor = GM) =>
    expectStatus<Resolution>(await inject(as, "POST", `${catalogUrl()}/${item.id}/resolve`, body), 200);

  const createInstance = async (payload: Record<string, unknown>, as: TestActor = GM) =>
    expectStatus<InstanceBody>(await inject(as, "POST", instancesUrl(), payload), 201);

  const instanceUrl = (instance: { id: string }) => `${instancesUrl()}/${instance.id}`;

  const command = (instance: InstanceBody, name: string, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "POST", `${instanceUrl(instance)}/${name}`, { expectedVersion: instance.version, ...payload });

  const createFeature = async () => {
    const response = await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/features`, {
      name: "Flame Ward",
      featureType: "ACTIVE",
      parameters: [{ key: "bonus", valueType: "INTEGER", defaultValue: 1 }],
      effects: [
        {
          key: "ward",
          displayOrder: 0,
          payload: { type: "MODIFIER", stat: "ac", amount: { type: "VAR", key: "param.bonus" } },
        },
      ],
    });

    return expectStatus<{ id: string; assetId: string }>(response, 201);
  };

  const createSpell = async () =>
    expectStatus<{ id: string; assetId: string; assetVersion: number }>(
      await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/spells`, {
        name: "Magic Missile",
        level: 1,
        school: "EVOCATION",
        castingTimeType: "ACTION",
        rangeType: "DISTANCE",
        rangeDistance: 120,
        rangeUnit: "FEET",
        durationType: "INSTANTANEOUS",
        componentVerbal: true,
        description: "Three darts of force",
      }),
      201,
    );

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "ITEMS_2024",
      editionYear: 2024,
      name: "Items",
      status: "ACTIVE",
      sourceReference: {},
      licenseCode: "TEST",
    });
    await db.insert(users).values(
      [ID.gm, ID.player, ID.otherPlayer, ID.editor, ID.outsider, ID.foreignGm, ID.admin].map((id) => ({
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
      { campaignId: ID.campaign, userId: ID.otherPlayer, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.foreignCampaign, userId: ID.foreignGm, role: "EDITOR", createdBy: ID.foreignGm },
    ]);
    // Owners stand in for the character, location and quest modules that don't exist yet.
    await db.insert(assets).values(
      [
        { id: ID.hero, title: "Hero", assetType: "ACTOR" as const, campaignId: ID.campaign },
        { id: ID.sidekick, title: "Sidekick", assetType: "ACTOR" as const, campaignId: ID.campaign },
        { id: ID.tavern, title: "Tavern", assetType: "LOCATION" as const, campaignId: ID.campaign },
        { id: ID.foreignHero, title: "Stranger", assetType: "ACTOR" as const, campaignId: ID.foreignCampaign },
      ].map((asset) => ({
        ...asset,
        slug: asset.title.toLowerCase(),
        scope: "CAMPAIGN" as const,
        origin: "CUSTOM" as const,
        status: "ACTIVE" as const,
      })),
    );
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("definitions", () => {
    it("creates a weapon with typed values and renders text harmless", async () => {
      const item = await createOk(RAPIER);

      expect(item).toMatchObject({
        view: "FULL",
        campaignId: ID.campaign,
        code: "rapier-1",
        category: "WEAPON",
        damageDiceCount: 1,
        damageDiceFaces: 8,
        damageType: "PIERCING",
        magicBonus: 1,
        weight: 2,
        armorCategory: null,
        gmNotes: "Once owned by the duke",
        status: "ACTIVE",
      });
      expect(item.descriptionHtml).toContain("<strong>slim</strong>");
      expect(item.descriptionHtml).not.toContain("<script");
    });

    it("takes only the fields of the category and checks the rules across them", async () => {
      // Armor values on a weapon, a weapon without combat type, armor without its class.
      expect((await create({ ...LONGSWORD, baseArmorClass: 12 })).statusCode).toBe(400);
      expect((await create({ ...LONGSWORD, weaponCombatType: undefined })).statusCode).toBe(400);
      expect((await create({ ...HALF_PLATE, baseArmorClass: undefined })).statusCode).toBe(400);
      // Versatile without its die, a capped Dexterity without the cap, magic values on mundane items.
      expect((await create({ ...LONGSWORD, versatileDiceFaces: null })).statusCode).toBe(400);
      expect((await create({ ...HALF_PLATE, dexterityCap: null })).statusCode).toBe(400);
      expect((await create({ ...LONGSWORD, magicBonus: 1 })).statusCode).toBe(400);
      expect((await create({ ...GAUNTLETS, rarity: undefined })).statusCode).toBe(400);
      // Effects that need attunement on an item without it, charges without charges.
      expect((await create({ ...GAUNTLETS, attunementMode: "NONE" })).statusCode).toBe(400);
      expect(
        (
          await create({
            ...GAUNTLETS,
            effects: [{ key: "zap", activation: "ON_USE", chargeCost: 1, payload: { type: "INFORMATION", message: "Zap" } }],
          })
        ).statusCode,
      ).toBe(400);
      // Unknown variables in effect expressions.
      expect(
        (
          await create({
            ...BELT,
            effects: [{ key: "x", payload: { type: "MODIFIER", stat: "ac", amount: { type: "VAR", key: "level.class" } } }],
          })
        ).statusCode,
      ).toBe(400);
      expect((await db.select().from(items)).length).toBe(0);
    });

    it("refuses missing rights and other campaigns", async () => {
      expect((await create(LONGSWORD, PLAYER)).statusCode).toBe(403);
      expect((await create(LONGSWORD, OUTSIDER)).statusCode).toBe(404);
      expect((await create(LONGSWORD, GM, campaignUrl(ID.foreignCampaign))).statusCode).toBe(404);

      const item = await createOk(LONGSWORD);

      expect((await inject(FOREIGN_GM, "GET", itemUrl(item))).statusCode).toBe(404);
      expect((await inject(FOREIGN_GM, "GET", `${campaignUrl(ID.foreignCampaign)}/${item.id}`)).statusCode).toBe(404);
      expect((await update(item, { description: "x" }, PLAYER)).statusCode).toBe(403);
    });

    it("updates with versions, checks the merged state and reports conflicts", async () => {
      const item = await createOk(LONGSWORD);
      const updated = await expectStatus<ItemBody>(
        await update(item, { name: "Bastard Sword", weight: 3, damageDiceFaces: 10 }),
        200,
      );

      expect(updated).toMatchObject({ name: "Bastard Sword", weight: 3, damageDiceFaces: 10, version: 2 });
      // The weapon values are one unit: a change from the old version is a conflict.
      expect((await update(item, { damageType: "PIERCING" })).statusCode).toBe(412);
      // Turning the sword into armor means emptying the weapon fields as well.
      expect((await update(updated, { ...HALF_PLATE, name: undefined })).statusCode).toBe(400);

      const armor = await expectStatus<ItemBody>(
        await update(updated, {
          ...HALF_PLATE,
          name: undefined,
          weaponCategory: null,
          weaponCombatType: null,
          damageDiceCount: null,
          damageDiceFaces: null,
          damageType: null,
          versatileDiceFaces: null,
          weaponProperties: [],
          masteryProperty: null,
        }),
        200,
      );

      expect(armor).toMatchObject({ category: "ARMOR", baseArmorClass: 15, weaponCategory: null });
    });

    it("archives softly, restores, and refuses rows that break a check constraint", async () => {
      const item = await createOk(LONGSWORD);
      const archived = await expectStatus<ItemBody>(
        await inject(GM, "DELETE", `${itemUrl(item)}?expectedAssetVersion=${item.assetVersion}`),
        200,
      );

      expect(archived.status).toBe("ARCHIVED");
      expect((await update(archived, { description: "x" })).statusCode).toBe(409);
      expect((await db.select().from(items)).map((row) => row.deletedAt)).toEqual([null]);

      const restored = await expectStatus<ItemBody>(
        await inject(GM, "POST", `${itemUrl(item)}/restore`, { expectedAssetVersion: archived.assetVersion }),
        200,
      );

      expect(restored.status).toBe("ACTIVE");
      await expect(db.update(items).set({ baseArmorClass: 12 }).where(eq(items.id, item.id))).rejects.toThrow();
      await expect(db.update(items).set({ magicBonus: 2 }).where(eq(items.id, item.id))).rejects.toThrow();
      await expect(db.update(items).set({ damageDiceFaces: 7 }).where(eq(items.id, item.id))).rejects.toThrow();
    });

    it("rolls the whole action back when a referenced feature or spell is missing", async () => {
      const grant = { key: "ward", featureAssetId: ID.unknown, activation: "EQUIPPED" };

      expect((await create({ ...BELT, featureGrants: [grant] })).statusCode).toBe(404);
      expect((await create({ ...BELT, spells: [{ key: "cast", spellAssetId: ID.unknown }] })).statusCode).toBe(404);
      expect((await db.select().from(assets).where(eq(assets.assetType, "ITEM"))).length).toBe(0);
    });

    it("keeps global items to administrators", async () => {
      expect((await create(LONGSWORD, GM, systemUrl)).statusCode).toBe(403);

      const global = await createOk({ ...LONGSWORD, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] }, ADMIN, systemUrl);

      expect(global.campaignId).toBeNull();
      expect(
        (await create({ ...LONGSWORD, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] }, ADMIN, systemUrl)).statusCode,
      ).toBe(409);
      expect((await update(global, { description: "x" }, GM)).statusCode).toBe(403);
    });
  });

  describe("catalog and player view", () => {
    it("shows players global items and released custom ones, without GM notes", async () => {
      const global = await createOk({ ...LONGSWORD, rulesetPolicy: "NEUTRAL" }, ADMIN, systemUrl);
      const custom = await createOk(RAPIER);
      const names = async () =>
        (await expectStatus<Page<ItemBody>>(await inject(PLAYER, "GET", catalogUrl()), 200)).data.map((item) => item.name);

      expect(await names()).toEqual(["Longsword"]);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${custom.id}`)).statusCode).toBe(404);

      await expectStatus(await update(custom, { releasedToPlayers: true }), 200);

      expect(await names()).toEqual(["Longsword", "Rapier +1"]);

      const view = await expectStatus<ItemBody>(await inject(PLAYER, "GET", `${catalogUrl()}/${custom.id}`), 200);

      expect(view.view).toBe("PLAYER");
      expect(view).not.toHaveProperty("gmNotes");
      expect(view).not.toHaveProperty("releasedToPlayers");
      expect(view.magicBonus).toBe(1);
      expect(global.code).toBe("longsword");
    });

    it("filters by category, magic and attunement", async () => {
      await createOk(LONGSWORD);
      await createOk(HALF_PLATE);
      await createOk(GAUNTLETS);

      const names = async (query: string) =>
        (await expectStatus<Page<ItemBody>>(await inject(GM, "GET", `${catalogUrl()}?${query}`), 200)).data.map(
          (item) => item.name,
        );

      expect(await names("category=ARMOR")).toEqual(["Half Plate"]);
      expect(await names("magical=true")).toEqual(["Gauntlets of Ogre Power"]);
      expect(await names("attunement=REQUIRED")).toEqual(["Gauntlets of Ogre Power"]);
      expect(await names("effect=BASE_VALUE")).toEqual(["Gauntlets of Ogre Power"]);
    });

    it("forks an item of the catalog into a custom copy", async () => {
      const global = await createOk({ ...RAPIER, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] }, ADMIN, systemUrl);

      expect((await inject(PLAYER, "POST", `${catalogUrl()}/${global.id}/fork`, {})).statusCode).toBe(403);

      const fork = await expectStatus<ItemBody>(
        await inject(GM, "POST", `${catalogUrl()}/${global.id}/fork`, { name: "Duelist's Rapier" }),
        201,
      );

      expect(fork).toMatchObject({
        campaignId: ID.campaign,
        name: "Duelist's Rapier",
        code: "rapier-1",
        status: "DRAFT",
        magicBonus: 1,
        damageType: "PIERCING",
        forkedFromAssetId: global.assetId,
        rulesetIds: [ID.ruleset],
      });
    });
  });

  describe("calculation", () => {
    const fighter = {
      characterLevel: 5,
      proficiencyBonus: 3,
      abilities: { str: 16, dex: 14 },
      proficiencies: ["simple-weapons", "martial-weapons", "medium-armor"],
    };

    it("computes attack and damage of a weapon for an actor", async () => {
      const rapier = await createOk(RAPIER);
      const longsword = await createOk(LONGSWORD);
      const finesse = await resolve(rapier, { actor: { ...fighter, abilities: { str: 10, dex: 18 } } });

      // Finesse takes Dexterity (+4), proficiency +3, magic +1.
      expect(finesse.weapon).toMatchObject({
        attackAbility: "dex",
        proficient: true,
        magicBonus: 1,
        attackBonus: 8,
        damage: { dice: { count: 1, faces: 8 }, bonus: 5, damageType: "PIERCING" },
      });

      const twoHanded = await resolve(longsword, { actor: fighter, attack: { twoHanded: true } });

      expect(twoHanded.weapon).toMatchObject({
        attackAbility: "str",
        attackBonus: 6,
        damage: { dice: { count: 1, faces: 10 }, bonus: 3, twoHanded: true },
      });

      const unknown = await resolve(longsword, { actor: {} });

      expect(unknown.weapon?.attackBonus).toBeNull();
      expect(unknown.weapon?.reasons).toEqual(["Missing ability scores", "Missing proficiencies"]);
    });

    it("computes armor class and effects only in the state they need", async () => {
      const plate = await createOk(HALF_PLATE);
      const armor = await resolve(plate, { actor: fighter, state: { equipped: true } });

      // 15 + Dexterity 2 (capped at 2).
      expect(armor.armor).toMatchObject({ armorClass: 17, active: true });

      const gauntlets = await createOk(GAUNTLETS);
      const notAttuned = await resolve(gauntlets, { actor: fighter, state: { equipped: true } });

      expect(notAttuned.state.functional).toBe(false);
      expect(notAttuned.totals.baseValues).toEqual({});

      const attuned = await resolve(gauntlets, { actor: fighter, state: { equipped: true, attuned: true } });

      expect(attuned.totals.baseValues).toEqual({ "ability.str": 19 });

      const belt = await createOk(BELT);
      const worn = await resolve(belt, { actor: fighter, state: { equipped: true, attuned: true } });

      expect(worn.totals.modifiers).toEqual({ "ability.str": 1, ac: 1 });
      expect((await resolve(belt, { actor: fighter, state: { equipped: true } })).totals.modifiers).toEqual({ ac: 1 });
    });

    it("resolves granted features and spells with charges", async () => {
      const feature = await createFeature();
      const spell = await createSpell();
      const wand = await createOk({
        ...BELT,
        name: "Wand of Wards",
        chargesMaximum: 7,
        recharge: { timing: "DAWN", regain: { type: "DICE", count: 1, faces: 6, bonus: 1 } },
        featureGrants: [
          {
            key: "ward",
            featureAssetId: feature.assetId,
            activation: "ATTUNED",
            bindings: [{ parameterKey: "bonus", bindingSource: "STATIC", staticValue: 2 }],
          },
        ],
        spells: [{ key: "missile", spellAssetId: spell.assetId, chargeCost: 3, castAtLevel: 2 }],
      });
      const resolved = await resolve(wand, {
        actor: fighter,
        state: { equipped: true, attuned: true, currentCharges: 2 },
      });

      expect(resolved.featureGrants[0]).toMatchObject({ key: "ward", active: true });
      expect(resolved.featureGrants[0]?.resolved?.effects[0]?.payload.amount).toBe(2);
      expect(resolved.spells).toEqual([expect.objectContaining({ key: "missile", available: false })]);

      // The spell can't be archived while the wand casts it; it shows the wand as usage.
      expect(
        (
          await inject(
            GM,
            "DELETE",
            `/api/v1/campaigns/${ID.campaign}/spells/${spell.id}?expectedAssetVersion=${spell.assetVersion}`,
          )
        ).statusCode,
      ).toBe(409);

      const usages = await expectStatus<{ typedUsages: { type: string }[] }>(
        await inject(GM, "GET", `/api/v1/campaigns/${ID.campaign}/catalog/spells/${spell.id}/usages`),
        200,
      );

      expect(usages.typedUsages.map((usage) => usage.type)).toEqual(["ITEM_SPELL"]);
    });
  });

  describe("instances", () => {
    it("creates instances with state, keeps stacks and refuses foreign owners", async () => {
      const arrows = await createOk(ARROWS);
      const sword = await createOk(LONGSWORD);
      const stack = await createInstance({
        itemDefinitionAssetId: arrows.assetId,
        quantity: 20,
        ownerType: "ACTOR",
        ownerAssetId: ID.hero,
      });

      expect(stack).toMatchObject({ view: "FULL", quantity: 20, ownerType: "ACTOR", equipped: false, name: "Arrows" });
      // Only stackable items have more than one piece.
      expect((await inject(GM, "POST", instancesUrl(), { itemDefinitionAssetId: sword.assetId, quantity: 2 })).statusCode).toBe(409);
      // Owners must be campaign assets of the fitting type.
      expect(
        (
          await inject(GM, "POST", instancesUrl(), {
            itemDefinitionAssetId: sword.assetId,
            ownerType: "ACTOR",
            ownerAssetId: ID.tavern,
          })
        ).statusCode,
      ).toBe(409);
      expect(
        (
          await inject(GM, "POST", instancesUrl(), {
            itemDefinitionAssetId: sword.assetId,
            ownerType: "ACTOR",
            ownerAssetId: ID.foreignHero,
          })
        ).statusCode,
      ).toBe(404);
      expect((await inject(PLAYER, "POST", instancesUrl(), { itemDefinitionAssetId: sword.assetId })).statusCode).toBe(403);
      expect((await inject(GM, "POST", instancesUrl(), { itemDefinitionAssetId: ID.unknown })).statusCode).toBe(404);

      const less = await expectStatus<InstanceBody>(await command(stack, "adjust-quantity", { delta: -5 }), 200);

      expect(less.quantity).toBe(15);
      expect((await command(less, "adjust-quantity", { delta: -15 })).statusCode).toBe(409);
      // A repeated command carries an old version and is refused.
      expect((await command(stack, "adjust-quantity", { delta: -5 })).statusCode).toBe(412);
    });

    it("transfers whole stacks or a part of them and ends equipment", async () => {
      const arrows = await createOk(ARROWS);
      const stack = await createInstance({
        itemDefinitionAssetId: arrows.assetId,
        quantity: 20,
        ownerType: "ACTOR",
        ownerAssetId: ID.hero,
      });
      const equipped = await expectStatus<InstanceBody>(await command(stack, "equip", { equipped: true }), 200);
      const split = await expectStatus<{ source: InstanceBody; transferred: InstanceBody }>(
        await command(equipped, "transfer", { ownerType: "ACTOR", ownerAssetId: ID.sidekick, quantity: 5 }),
        200,
      );

      expect(split.source).toMatchObject({ quantity: 15, ownerAssetId: ID.hero, equipped: true });
      expect(split.transferred).toMatchObject({ quantity: 5, ownerAssetId: ID.sidekick, equipped: false });

      const moved = await expectStatus<{ transferred: InstanceBody }>(
        await command(split.source, "transfer", { ownerType: "LOCATION", ownerAssetId: ID.tavern }),
        200,
      );

      expect(moved.transferred).toMatchObject({ id: stack.id, quantity: 15, ownerType: "LOCATION", equipped: false });
      expect((await command(moved.transferred, "equip", { equipped: true })).statusCode).toBe(409);
    });

    it("keeps several stacks of one item and merges them only in the same state", async () => {
      const arrows = await createOk(ARROWS);
      const sword = await createOk(LONGSWORD);
      const stack = (payload: Record<string, unknown> = {}) =>
        createInstance({ itemDefinitionAssetId: arrows.assetId, quantity: 10, ownerType: "ACTOR", ownerAssetId: ID.hero, ...payload });
      const merge = (source: InstanceBody, target: InstanceBody) =>
        command(source, "merge", { intoInstanceId: target.id, expectedTargetVersion: target.version });
      const first = await stack();
      const second = await stack({ quantity: 5 });

      // Several stacks of one item are fine.
      expect((await expectStatus<Page<InstanceBody>>(await inject(GM, "GET", instancesUrl()), 200)).data).toHaveLength(2);

      // Another condition, owner or knowledge keeps them apart.
      const damaged = await stack({ state: { condition: "DAMAGED" } });
      const elsewhere = await stack({ ownerType: "LOCATION", ownerAssetId: ID.tavern });

      expect((await merge(damaged, first)).json().error.details).toEqual({ differences: ["condition"] });
      expect((await merge(elsewhere, first)).json().error.details).toEqual({ differences: ["ownerType", "ownerAssetId"] });

      await expectStatus(
        await inject(GM, "POST", `${instanceUrl(second)}/identify`, { userId: null, knowledgeLevel: "SEEN" }),
        200,
      );
      expect((await merge(second, first)).json().error.details).toEqual({ differences: ["knowledge"] });
      await expectStatus(
        await inject(GM, "POST", `${instanceUrl(first)}/identify`, { userId: null, knowledgeLevel: "SEEN" }),
        200,
      );

      // Stale versions, the stack itself and items that don't stack are refused.
      expect((await command(second, "merge", { intoInstanceId: first.id, expectedTargetVersion: 99 })).statusCode).toBe(412);
      expect((await merge(first, first)).statusCode).toBe(409);

      const swordA = await createInstance({ itemDefinitionAssetId: sword.assetId });
      const swordB = await createInstance({ itemDefinitionAssetId: sword.assetId });

      expect((await merge(swordA, swordB)).statusCode).toBe(409);

      const merged = await expectStatus<InstanceBody>(await merge(second, first), 200);

      expect(merged).toMatchObject({ id: first.id, quantity: 15 });
      expect((await inject(GM, "GET", instanceUrl(second))).statusCode).toBe(404);
    });

    it("gives every piece of a stack its own charges and attunement", async () => {
      const beads = await createOk({
        name: "Bead of Force",
        category: "MAGIC_ITEM",
        magicItemType: "WONDROUS_ITEM",
        rarity: "RARE",
        attunementMode: "OPTIONAL",
        isStackable: true,
        chargesMaximum: 3,
      });
      const stack = await createInstance({
        itemDefinitionAssetId: beads.assetId,
        quantity: 3,
        ownerType: "ACTOR",
        ownerAssetId: ID.hero,
      });

      // Charges and attunement belong to one piece.
      expect((await command(stack, "spend-charge", { amount: 1 })).statusCode).toBe(409);
      expect((await command(stack, "attune", { attuned: true })).statusCode).toBe(409);
      expect((await command(stack, "split", { quantity: 3 })).statusCode).toBe(409);

      const { source, split } = await expectStatus<{ source: InstanceBody; split: InstanceBody }>(
        await command(stack, "split", { quantity: 1 }),
        200,
      );

      expect(source).toMatchObject({ quantity: 2, currentCharges: 3 });
      expect(split).toMatchObject({ quantity: 1, currentCharges: 3, ownerAssetId: ID.hero });

      const used = await expectStatus<InstanceBody>(await command(split, "spend-charge", { amount: 1 }), 200);

      expect(used.currentCharges).toBe(2);
      // A used bead no longer fits the full ones.
      expect(
        (await command(used, "merge", { intoInstanceId: source.id, expectedTargetVersion: source.version })).json().error
          .details,
      ).toEqual({ differences: ["currentCharges"] });

      const attuned = await expectStatus<InstanceBody>(await command(used, "attune", { attuned: true }), 200);

      // An attuned piece stays a single piece.
      expect((await command(attuned, "adjust-quantity", { delta: 1 })).statusCode).toBe(409);
    });

    it("attunes only where the item allows it, three items per actor and one copy of each", async () => {
      const sword = await createOk(LONGSWORD);
      const gauntlets = await createOk(GAUNTLETS);
      const plain = await createInstance({ itemDefinitionAssetId: sword.assetId, ownerType: "ACTOR", ownerAssetId: ID.hero });

      expect((await command(plain, "attune", { attuned: true })).statusCode).toBe(409);

      // A second copy of the same item can't be attuned, also not by another way of attuning.
      const first = await createInstance({ itemDefinitionAssetId: gauntlets.assetId, ownerType: "ACTOR", ownerAssetId: ID.hero });
      const copy = await createInstance({ itemDefinitionAssetId: gauntlets.assetId, ownerType: "ACTOR", ownerAssetId: ID.hero });
      const attunedFirst = await expectStatus<InstanceBody>(await command(first, "attune", { attuned: true }), 200);
      const refused = await command(copy, "attune", { attuned: true });

      expect(refused.statusCode).toBe(409);
      expect(refused.json().error.message).toBe("An actor can be attuned to only one copy of the same item");

      // Another actor may attune to its own copy.
      const sidekickCopy = await createInstance({
        itemDefinitionAssetId: gauntlets.assetId,
        ownerType: "ACTOR",
        ownerAssetId: ID.sidekick,
      });

      await expectStatus(await command(sidekickCopy, "attune", { attuned: true }), 200);

      // Three different items at most.
      const others = [];

      for (const name of ["Cloak of Elvenkind", "Ring of Warmth", "Amulet of Health"]) {
        const definition = await createOk({ ...GAUNTLETS, name, effects: [] });

        others.push(
          await createInstance({ itemDefinitionAssetId: definition.assetId, ownerType: "ACTOR", ownerAssetId: ID.hero }),
        );
      }

      await expectStatus(await command(others[0]!, "attune", { attuned: true }), 200);
      await expectStatus(await command(others[1]!, "attune", { attuned: true }), 200);
      expect((await command(others[2]!, "attune", { attuned: true })).json().error.message).toBe(
        "An actor can be attuned to 3 items at most",
      );

      // What the attuned instance gives its holder comes from its stored state.
      const resolution = await expectStatus<Resolution>(
        await inject(GM, "POST", `${instanceUrl(attunedFirst)}/resolve`, { actor: { abilities: { str: 10 } } }),
        200,
      );

      expect(resolution.totals.baseValues).toEqual({ "ability.str": 19 });
    });

    it("spends charges within the maximum", async () => {
      const wand = await createOk({ ...BELT, name: "Wand", chargesMaximum: 3 });
      const instance = await createInstance({ itemDefinitionAssetId: wand.assetId });

      expect(instance.currentCharges).toBe(3);

      const spent = await expectStatus<InstanceBody>(await command(instance, "spend-charge", { amount: 2 }), 200);

      expect(spent.currentCharges).toBe(1);
      expect((await command(spent, "spend-charge", { amount: 2 })).statusCode).toBe(409);
      expect(
        (await inject(GM, "PATCH", instanceUrl(spent), { currentCharges: 5, expectedVersion: spent.version })).statusCode,
      ).toBe(409);
      expect(
        (await inject(GM, "POST", instancesUrl(), { itemDefinitionAssetId: wand.assetId, state: { currentCharges: 9 } }))
          .statusCode,
      ).toBe(409);
    });

    it("shows players only instances they know, as far as they know them", async () => {
      const rapier = await createOk(RAPIER);
      const instance = await createInstance({
        itemDefinitionAssetId: rapier.assetId,
        ownerType: "ACTOR",
        ownerAssetId: ID.hero,
        state: { notes: "Cursed" },
      });

      expect((await inject(PLAYER, "GET", instanceUrl(instance))).statusCode).toBe(404);
      expect((await expectStatus<Page<InstanceBody>>(await inject(PLAYER, "GET", instancesUrl()), 200)).data).toEqual([]);

      // Everybody has seen it: an unnamed slim blade, no magic.
      await expectStatus(
        await inject(GM, "POST", `${instanceUrl(instance)}/identify`, { userId: null, knowledgeLevel: "SEEN" }),
        200,
      );

      const seen = await expectStatus<InstanceBody>(await inject(PLAYER, "GET", instanceUrl(instance)), 200);

      expect(seen).toMatchObject({ view: "PLAYER", knowledgeLevel: "SEEN", name: null, item: null, currentCharges: null });
      expect(seen.appearance).toMatchObject({ category: "WEAPON", damageDiceFaces: 8 });
      expect(seen).not.toHaveProperty("notes");
      expect(JSON.stringify(seen)).not.toContain("magicBonus");

      // One player identifies it, also without a release of the definition.
      await expectStatus(
        await inject(GM, "POST", `${instanceUrl(instance)}/identify`, {
          userId: ID.player,
          knowledgeLevel: "IDENTIFIED",
          knownName: "The Duke's Rapier",
        }),
        200,
      );

      const identified = await expectStatus<InstanceBody>(await inject(PLAYER, "GET", instanceUrl(instance)), 200);

      expect(identified).toMatchObject({ knowledgeLevel: "IDENTIFIED", name: "The Duke's Rapier" });
      expect(identified.item).toMatchObject({ view: "PLAYER", magicBonus: 1 });
      expect(identified.item).not.toHaveProperty("gmNotes");
      expect((await inject(OTHER_PLAYER, "GET", instanceUrl(instance))).json()).toMatchObject({ knowledgeLevel: "SEEN" });
      // Knowledge is for players; the GM and editors see everything anyway.
      expect(
        (await inject(GM, "POST", `${instanceUrl(instance)}/identify`, { userId: ID.editor, knowledgeLevel: "SEEN" })).statusCode,
      ).toBe(409);
      expect(
        (await inject(PLAYER, "POST", `${instanceUrl(instance)}/identify`, { userId: null, knowledgeLevel: "IDENTIFIED" }))
          .statusCode,
      ).toBe(403);

      const full = await expectStatus<InstanceBody>(await inject(EDITOR, "GET", instanceUrl(instance)), 200);

      expect(full.knowledge).toHaveLength(2);
      expect(full.notes).toBe("Cursed");
    });

    it("gives players no way to test what an unidentified item is or who has it", async () => {
      const rapier = await createOk({ ...RAPIER, releasedToPlayers: true });
      const instance = await createInstance({
        itemDefinitionAssetId: rapier.assetId,
        customName: "Duke's blade",
        ownerType: "ACTOR",
        ownerAssetId: ID.hero,
      });

      await expectStatus(
        await inject(GM, "POST", `${instanceUrl(instance)}/identify`, {
          userId: null,
          knowledgeLevel: "SEEN",
          knownName: "Slim sword",
        }),
        200,
      );

      // The instances of a catalog item would name the unidentified item.
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${rapier.id}/instances`)).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${catalogUrl()}/${rapier.id}/instances`)).statusCode).toBe(200);
      // Filters on definition and owner are refused; the search only knows the known name.
      for (const query of [`itemAssetId=${rapier.assetId}`, `ownerAssetId=${ID.hero}`, "ownerType=ACTOR"]) {
        expect((await inject(PLAYER, "GET", `${instancesUrl()}?${query}`)).statusCode).toBe(400);
      }

      const search = async (term: string) =>
        (await expectStatus<Page<InstanceBody>>(await inject(PLAYER, "GET", `${instancesUrl()}?search=${term}`), 200)).data
          .length;

      expect(await search("Duke")).toBe(0);
      expect(await search("Rapier")).toBe(0);
      expect(await search("Slim")).toBe(1);
    });

    it("changes existing knowledge only with its version", async () => {
      const sword = await createOk(LONGSWORD);
      const instance = await createInstance({ itemDefinitionAssetId: sword.assetId });
      const url = `${instanceUrl(instance)}/identify`;
      const first = await expectStatus<{ version: number }>(
        await inject(GM, "POST", url, { userId: ID.player, knowledgeLevel: "SEEN" }),
        200,
      );

      expect((await inject(EDITOR, "POST", url, { userId: ID.player, knowledgeLevel: "IDENTIFIED" })).statusCode).toBe(412);
      expect(
        (await inject(EDITOR, "POST", url, { userId: ID.player, knowledgeLevel: "IDENTIFIED", expectedVersion: first.version }))
          .statusCode,
      ).toBe(200);
      expect(
        (await inject(GM, "POST", url, { userId: ID.player, knowledgeLevel: "UNKNOWN", expectedVersion: first.version }))
          .statusCode,
      ).toBe(412);
    });

    it("refuses to undo a transfer, so a split can't create pieces", async () => {
      const arrows = await createOk(ARROWS);
      const stack = await createInstance({ itemDefinitionAssetId: arrows.assetId, quantity: 10 });

      await expectStatus(await command(stack, "transfer", { ownerType: "ACTOR", ownerAssetId: ID.hero, quantity: 4 }), 200);

      const [event] = await db
        .select()
        .from(entityChangeEvents)
        .where(eq(entityChangeEvents.action, "itemInstance.transfer"));

      expect((await inject(GM, "POST", `/api/v1/history/events/${event!.id}/revert`, {})).statusCode).toBe(409);
      expect((await db.select().from(itemInstances)).map((row) => row.quantity).sort()).toEqual([4, 6]);
    });

    it("deletes only the version it was sent for", async () => {
      const sword = await createOk(LONGSWORD);
      const instance = await createInstance({ itemDefinitionAssetId: sword.assetId, ownerType: "ACTOR", ownerAssetId: ID.hero });

      await expectStatus(await command(instance, "equip", { equipped: true }), 200);
      expect((await inject(GM, "DELETE", `${instanceUrl(instance)}?expectedVersion=${instance.version}`)).statusCode).toBe(412);
      expect((await db.select().from(itemInstances)).map((row) => row.deletedAt)).toEqual([null]);
    });

    it("keeps a definition in use from being archived and deletes instances softly", async () => {
      const sword = await createOk(LONGSWORD);
      const instance = await createInstance({ itemDefinitionAssetId: sword.assetId });

      await expectStatus(
        await inject(GM, "POST", `${instanceUrl(instance)}/identify`, { userId: null, knowledgeLevel: "SEEN" }),
        200,
      );
      expect(
        (await inject(GM, "DELETE", `${itemUrl(sword)}?expectedAssetVersion=${sword.assetVersion}`)).statusCode,
      ).toBe(409);

      const list = await expectStatus<Page<InstanceBody>>(
        await inject(GM, "GET", `${catalogUrl()}/${sword.id}/instances`),
        200,
      );

      expect(list.data.map((entry) => entry.id)).toEqual([instance.id]);
      expect((await inject(GM, "DELETE", `${instanceUrl(instance)}?expectedVersion=99`)).statusCode).toBe(412);
      await expectStatus(await inject(GM, "DELETE", `${instanceUrl(instance)}?expectedVersion=${instance.version}`), 204);
      expect((await inject(GM, "GET", instanceUrl(instance))).statusCode).toBe(404);
      expect((await db.select().from(itemInstances)).map((row) => row.deletedAt !== null)).toEqual([true]);
      expect((await db.select().from(itemInstanceKnowledge)).map((row) => row.deletedAt !== null)).toEqual([true]);
      await expectStatus(
        await inject(GM, "DELETE", `${itemUrl(sword)}?expectedAssetVersion=${sword.assetVersion}`),
        200,
      );
    });

    it("rolls a failing transfer back as a whole", async () => {
      const arrows = await createOk(ARROWS);
      const stack = await createInstance({ itemDefinitionAssetId: arrows.assetId, quantity: 10, ownerType: "ACTOR", ownerAssetId: ID.hero });

      expect(
        (await command(stack, "transfer", { ownerType: "ACTOR", ownerAssetId: ID.tavern, quantity: 4 })).statusCode,
      ).toBe(409);

      const rows = await db.select().from(itemInstances);

      expect(rows.map((row) => row.quantity)).toEqual([10]);
    });

    it("keeps a history of instance changes that editors can undo", async () => {
      const arrows = await createOk(ARROWS);
      const stack = await createInstance({ itemDefinitionAssetId: arrows.assetId, quantity: 10 });
      const changed = await expectStatus<InstanceBody>(await command(stack, "adjust-quantity", { delta: 5 }), 200);
      await expectStatus(await inject(EDITOR, "GET", `/api/v1/history/itemInstance/${stack.id}`), 200);

      const [event] = await db
        .select()
        .from(entityChangeEvents)
        .where(eq(entityChangeEvents.action, "itemInstance.adjustQuantity"));

      expect(event).toBeDefined();
      expect((await inject(PLAYER, "GET", `/api/v1/history/itemInstance/${stack.id}`)).statusCode).toBe(404);
      await expectStatus(await inject(EDITOR, "POST", `/api/v1/history/events/${event!.id}/revert`, {}), 200);
      expect((await inject(GM, "GET", instanceUrl(changed))).json()).toMatchObject({ quantity: 10 });
    });
  });
});
