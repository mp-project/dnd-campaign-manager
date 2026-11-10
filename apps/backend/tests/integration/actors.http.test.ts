import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  actors,
  assetLinks,
  assets,
  assetTags,
  campaignMemberships,
  campaigns,
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
  editor: "a0000000-0000-4000-8000-000000000004",
  outsider: "a0000000-0000-4000-8000-000000000005",
  foreignGm: "a0000000-0000-4000-8000-000000000006",
  campaign: "c0000000-0000-4000-8000-00000000000a",
  foreignCampaign: "c0000000-0000-4000-8000-00000000000b",
  location: "e0000000-0000-4000-8000-000000000001",
  foreignLocation: "e0000000-0000-4000-8000-000000000003",
  faction: "e0000000-0000-4000-8000-000000000004",
  note: "e0000000-0000-4000-8000-000000000005",
  tag: "f0000000-0000-4000-8000-000000000001",
  unknown: "f0000000-0000-4000-8000-00000000000f",
} as const;

const actor = (actorId: string): TestActor => ({ actorId, systemRole: "USER" });

const GM = actor(ID.gm);
const EDITOR = actor(ID.editor);
const PLAYER = actor(ID.player);
const OUTSIDER = actor(ID.outsider);
const FOREIGN_GM = actor(ID.foreignGm);

type ActorBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  name: string;
  status: string;
  category: string;
  gmNotes?: string | null;
  abilities?: Record<string, { score: number }>;
  speeds?: { mode: string; distanceFeet: number }[];
  loot?: { key: string; kind: string; available: boolean }[];
  tagIds?: string[];
  merged?: string[];
};

type StatBlockBody = {
  abilities: { ability: string; score: number; modifier: number; savingThrow: { bonus: number | null } }[];
  skills: { skill: string; bonus: number | null }[];
  passivePerception: number | null;
  armorClass: { value: number; source: string; base: number | null; shieldBonus: number };
  hitPoints: { maximum: number | null; source: string };
  attacks: { source: string; name: string; attackBonus: number | null }[];
  items: { name: string; equipped: boolean }[];
  reasons: string[];
};

const STAT_BLOCK = {
  abilities: {
    str: { score: 16 },
    dex: { score: 14, savingThrowProficient: true },
    con: { score: 12 },
    int: { score: 10 },
    wis: { score: 13 },
    cha: { score: 8 },
  },
  skills: [{ skill: "perception", proficiency: "EXPERTISE" }],
  combat: { proficiencyBonus: 2, hitPointFormula: "3d8 + 3" },
  speeds: [{ mode: "WALK", distanceFeet: 30 }],
};

describe("actors", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const actorsUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/actors`;

  const inject = (as: TestActor, method: string, url: string, payload?: unknown) =>
    session.injectAs(as, {
      method: method as "GET",
      url,
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });

  const expectStatus = async <T>(response: Awaited<ReturnType<typeof inject>>, status: number): Promise<T> => {
    expect({ status: response.statusCode, body: response.json() }).toMatchObject({ status });

    return response.json() as T;
  };

  const create = (payload: Record<string, unknown>, as: TestActor = GM, campaignId?: string) =>
    inject(as, "POST", actorsUrl(campaignId), payload);

  const createOk = async (payload: Record<string, unknown> = {}) =>
    expectStatus<ActorBody>(
      await create({ name: "Mira", category: "NPC", gmNotes: "Works for the baron.", ...payload }),
      201,
    );

  const get = (actorId: string, as: TestActor = GM) => inject(as, "GET", `${actorsUrl()}/${actorId}`);

  const update = (body: ActorBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", `${actorsUrl()}/${body.id}`, {
      expectedVersion: body.version,
      expectedAssetVersion: body.assetVersion,
      ...payload,
    });

  const statBlock = (actorId: string, as: TestActor = GM) => inject(as, "GET", `${actorsUrl()}/${actorId}/stat-block`);

  const createItem = async (payload: Record<string, unknown>) =>
    expectStatus<{ id: string; assetId: string; version: number; assetVersion: number }>(
      await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/items`, payload),
      201,
    );

  const giveItem = async (owner: ActorBody, itemAssetId: string, equip = true) => {
    const instance = await expectStatus<{ id: string; version: number }>(
      await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/item-instances`, {
        itemDefinitionAssetId: itemAssetId,
        quantity: 1,
        ownerType: "ACTOR",
        ownerAssetId: owner.assetId,
      }),
      201,
    );

    if (!equip) {
      return instance;
    }

    return expectStatus<{ id: string; version: number }>(
      await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/item-instances/${instance.id}/equip`, {
        expectedVersion: instance.version,
        equipped: true,
      }),
      200,
    );
  };

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values({
      id: ID.ruleset,
      code: "ACTORS_MAIN",
      name: "Ruleset",
      status: "ACTIVE",
      editionYear: 2024,
      sourceReference: {},
      licenseCode: "TEST",
    });
    await db.insert(users).values(
      [ID.gm, ID.player, ID.editor, ID.outsider, ID.foreignGm].map((id) => ({
        id,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "User",
        systemRole: "USER" as const,
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
      { campaignId: ID.foreignCampaign, userId: ID.foreignGm, role: "EDITOR", createdBy: ID.foreignGm },
    ]);

    const own = { scope: "CAMPAIGN", origin: "CUSTOM", campaignId: ID.campaign, status: "ACTIVE" } as const;

    await db.insert(assets).values([
      { ...own, id: ID.location, assetType: "LOCATION", title: "Inn", slug: "inn" },
      { ...own, id: ID.faction, assetType: "FACTION", title: "Red Blades", slug: "red-blades" },
      { ...own, id: ID.note, assetType: "NOTE", title: "Letter", slug: "letter" },
      {
        ...own,
        campaignId: ID.foreignCampaign,
        id: ID.foreignLocation,
        assetType: "LOCATION",
        title: "Foreign",
        slug: "foreign",
      },
    ]);
    await db.insert(tags).values({ id: ID.tag, campaignId: ID.campaign, name: "Villain", normalizedName: "villain" });
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("creating", () => {
    it("creates asset and actor with defaults for every part; there is one route for every category", async () => {
      const created = await createOk({ tagIds: [ID.tag] });

      expect(created).toMatchObject({
        view: "FULL",
        name: "Mira",
        status: "ACTIVE",
        category: "NPC",
        size: "MEDIUM",
        gmNotes: "Works for the baron.",
        tagIds: [ID.tag],
        speeds: [{ mode: "WALK", distanceFeet: 30, hover: false, notes: null }],
        loot: [],
      });
      expect(created.abilities?.str).toMatchObject({ score: 10, savingThrowProficient: false });

      const [asset] = await db.select().from(assets).where(eq(assets.id, created.assetId));

      expect(asset).toMatchObject({ assetType: "ACTOR", scope: "CAMPAIGN", rulesetPolicy: "NEUTRAL" });

      for (const category of ["PLAYER_CHARACTER", "MONSTER"]) {
        expect((await create({ name: category, category })).statusCode).toBe(201);
      }

      // No routes per category.
      expect((await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/npcs`, { name: "X" })).statusCode).toBe(404);
    });

    it("lets editors create and refuses players, outsiders and other campaigns", async () => {
      expect((await create({ name: "Bob", category: "NPC" }, EDITOR)).statusCode).toBe(201);
      expect((await create({ name: "Bob", category: "NPC" }, PLAYER)).statusCode).toBe(403);
      expect((await create({ name: "Bob", category: "NPC" }, OUTSIDER)).statusCode).toBe(404);
      expect((await create({ name: "Bob", category: "NPC" }, GM, ID.foreignCampaign)).statusCode).toBe(404);
    });

    it("refuses invalid data with 400 and writes nothing", async () => {
      const responses = [
        await create({ name: "Mira" }),
        await create({ name: "Mira", category: "DRAGON" }),
        await create({ name: "Mira", category: "NPC", abilities: { str: { score: 10 } } }),
        await create({ name: "Mira", category: "NPC", campaignId: ID.foreignCampaign }),
        await create({
          name: "Mira",
          category: "NPC",
          abilities: { ...STAT_BLOCK.abilities, str: { score: 10, scoreOverride: 18 } },
        }),
      ];

      expect(responses.map((response) => response.statusCode)).toEqual([400, 400, 400, 400, 400]);
      expect(await db.select().from(actors)).toHaveLength(0);
    });

    it("rolls everything back when a part of the action fails", async () => {
      const response = await create({
        name: "Mira",
        category: "NPC",
        tagIds: [ID.tag],
        relatedLinks: [{ targetAssetId: ID.foreignLocation, relationType: "RELATED_TO" }],
      });

      expect(response.statusCode).toBe(404);
      expect(await db.select().from(assets).where(eq(assets.assetType, "ACTOR"))).toHaveLength(0);
      expect(await db.select().from(actors)).toHaveLength(0);
      expect(await db.select().from(assetTags)).toHaveLength(0);
    });

    it("keeps the database rules even for writes that skip the API", async () => {
      const created = await createOk();

      await expect(
        db.update(actors).set({ abilities: { str: { score: 10 } } }).where(eq(actors.id, created.id)),
      ).rejects.toThrow();
      await expect(
        db.update(actors).set({ skills: {} as never }).where(eq(actors.id, created.id)),
      ).rejects.toThrow();
      // One actor per asset.
      await expect(
        db.insert(actors).values({
          campaignId: ID.campaign,
          assetId: created.assetId,
          category: "NPC",
          abilities: STAT_BLOCK.abilities,
        }),
      ).rejects.toThrow();
    });
  });

  describe("reading and listing", () => {
    it("lists all categories in one list, filtered and searched by name or display name", async () => {
      await createOk({ name: "Mira", displayName: "The Grey" });
      await createOk({ name: "Goblin", category: "MONSTER", creatureType: "HUMANOID" });
      await createOk({ name: "Aria", category: "PLAYER_CHARACTER" });

      const list = async (query: string) =>
        (await expectStatus<{ data: ActorBody[] }>(await inject(GM, "GET", `${actorsUrl()}${query}`), 200)).data.map(
          (entry) => entry.name,
        );

      expect(await list("")).toEqual(["Aria", "Goblin", "Mira"]);
      expect(await list("?category=MONSTER")).toEqual(["Goblin"]);
      expect(await list("?search=grey")).toEqual(["Mira"]);
      expect(await list("?creatureType=HUMANOID")).toEqual(["Goblin"]);
      expect(await list("?limit=2")).toEqual(["Aria", "Goblin"]);
    });

    it("shows players only shared actors, in the player view without values, notes or loot", async () => {
      const mira = await createOk({ description: "Tall *and* grey", appearance: { eyes: "Green" } });
      await createOk({ name: "Hidden" });

      expect((await get(mira.id, PLAYER)).statusCode).toBe(404);
      expect((await expectStatus<{ data: unknown[] }>(await inject(PLAYER, "GET", actorsUrl()), 200)).data).toEqual([]);

      await expectStatus(
        await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/shares`, {
          assetId: mira.assetId,
          audience: "ALL_PLAYERS",
        }),
        201,
      );

      const seen = await expectStatus<Record<string, unknown>>(await get(mira.id, PLAYER), 200);

      expect(seen).toEqual({
        view: "PLAYER",
        id: mira.id,
        assetId: mira.assetId,
        name: "Mira",
        summary: null,
        category: "NPC",
        displayName: null,
        size: "MEDIUM",
        creatureType: null,
        creatureSubtype: null,
        alignment: null,
        description: "Tall *and* grey",
        descriptionHtml: "<p>Tall <em>and</em> grey</p>\n",
        appearance: expect.objectContaining({ eyes: "Green" }),
      });

      const listed = await expectStatus<{ data: Record<string, unknown>[] }>(await inject(PLAYER, "GET", actorsUrl()), 200);

      expect(listed.data.map((entry) => entry.name)).toEqual(["Mira"]);
      expect(listed.data[0]).not.toHaveProperty("gmNotes");

      // The share reveals who the actor is, not its values.
      expect((await statBlock(mira.id, PLAYER)).statusCode).toBe(404);

      const content = await expectStatus<{ content: Record<string, unknown> }>(
        await inject(PLAYER, "GET", `/api/v1/campaigns/${ID.campaign}/shares`),
        200,
      );

      expect(JSON.stringify(content)).not.toContain("baron");
    });

    it("hides actors of other campaigns", async () => {
      const mira = await createOk();

      expect((await inject(GM, "GET", `${actorsUrl(ID.foreignCampaign)}/${mira.id}`)).statusCode).toBe(404);
      expect((await inject(FOREIGN_GM, "GET", `${actorsUrl(ID.foreignCampaign)}/${mira.id}`)).statusCode).toBe(404);
      expect((await get(ID.unknown)).statusCode).toBe(404);
    });
  });

  describe("changing", () => {
    it("changes the category and parts, keeping all data, and detects conflicts per field", async () => {
      const goblin = await createOk({ name: "Snik", category: "MONSTER", ...STAT_BLOCK });
      const companion = await expectStatus<ActorBody>(
        await update(goblin, { category: "PLAYER_CHARACTER", displayName: "Snik the Loyal" }),
        200,
      );

      expect(companion).toMatchObject({ category: "PLAYER_CHARACTER", merged: [] });
      expect(companion.abilities?.str).toMatchObject({ score: 16 });

      // A stale version on another field is merged; on the same field it is a conflict.
      expect((await update(goblin, { notes: "Likes shiny things" })).statusCode).toBe(200);
      expect((await update(goblin, { category: "NPC" })).statusCode).toBe(412);
    });

    it("archives and restores; archived actors refuse changes", async () => {
      const mira = await createOk();
      const archived = await expectStatus<ActorBody>(
        await inject(GM, "DELETE", `${actorsUrl()}/${mira.id}?expectedAssetVersion=${mira.assetVersion}`),
        200,
      );

      expect(archived.status).toBe("ARCHIVED");
      expect((await update(archived, { notes: "x" })).statusCode).toBe(409);
      expect(
        (await expectStatus<{ data: unknown[] }>(await inject(GM, "GET", actorsUrl()), 200)).data,
      ).toHaveLength(0);

      const restored = await expectStatus<ActorBody>(
        await inject(GM, "POST", `${actorsUrl()}/${mira.id}/restore`, { expectedAssetVersion: archived.assetVersion }),
        200,
      );

      expect(restored.status).toBe("ACTIVE");
      expect((await update(restored, { notes: "Back" })).statusCode).toBe(200);
    });

    it("refuses players and keeps the history for GMs and editors", async () => {
      const mira = await createOk();

      expect((await update(mira, { notes: "x" }, PLAYER)).statusCode).toBe(403);

      await expectStatus(await update(mira, { size: "SMALL" }), 200);

      const history = await expectStatus<{ data: { action: string }[] }>(
        await inject(EDITOR, "GET", `/api/v1/history/actor/${mira.id}`),
        200,
      );

      expect(history.data.map((event) => event.action)).toEqual(
        expect.arrayContaining(["actor.create", "actor.update"]),
      );
      expect((await inject(PLAYER, "GET", `/api/v1/history/actor/${mira.id}`)).statusCode).toBe(404);
    });
  });

  describe("items, references and loot", () => {
    it("computes the stat block from base values and equipped items", async () => {
      const knight = await createOk({ name: "Knight", ...STAT_BLOCK, proficiencies: [{ type: "WEAPON", code: "martial-weapons" }] });
      const plate = await createItem({
        name: "Half Plate",
        category: "ARMOR",
        armorCategory: "MEDIUM",
        baseArmorClass: 15,
        dexterityMode: "CAPPED",
        dexterityCap: 2,
      });
      const sword = await createItem({
        name: "Longsword",
        category: "WEAPON",
        weaponCategory: "MARTIAL",
        weaponCombatType: "MELEE",
        damageDiceCount: 1,
        damageDiceFaces: 8,
        damageType: "SLASHING",
      });

      await giveItem(knight, plate.assetId);
      await giveItem(knight, sword.assetId);

      const block = await expectStatus<StatBlockBody>(await statBlock(knight.id), 200);

      expect(block.abilities.find((entry) => entry.ability === "dex")).toMatchObject({
        score: 14,
        modifier: 2,
        savingThrow: { bonus: 4 },
      });
      expect(block.skills.find((entry) => entry.skill === "perception")?.bonus).toBe(5);
      expect(block.passivePerception).toBe(15);
      expect(block.armorClass).toMatchObject({ value: 17, source: "CALCULATED", base: 17 });
      expect(block.hitPoints).toEqual({ maximum: 16, formula: "3d8 + 3", source: "CALCULATED" });
      expect(block.attacks).toEqual([expect.objectContaining({ source: "ITEM", name: "Longsword", attackBonus: 5 })]);
      expect(block.items.map((entry) => entry.name).sort()).toEqual(["Half Plate", "Longsword"]);
      expect(block.reasons).toEqual([]);
    });

    it("checks named items at the end of the action and keeps them from being archived", async () => {
      const rope = await createItem({ name: "Rope", category: "ADVENTURING_GEAR" });

      const response = await create({
        name: "Thief",
        category: "NPC",
        proficiencies: [{ type: "TOOL", itemAssetId: ID.note }],
      });

      expect(response.statusCode).toBe(409);
      expect(await db.select().from(actors)).toHaveLength(0);
      expect(
        (await create({ name: "Thief", category: "NPC", loot: [{ key: "x", kind: "ITEM", itemAssetId: ID.unknown }] }))
          .statusCode,
      ).toBe(404);

      const thief = await createOk({
        name: "Thief",
        loot: [{ key: "rope", kind: "ITEM", itemAssetId: rope.assetId, quantity: "1d2" }],
      });

      expect(thief.loot).toEqual([expect.objectContaining({ key: "rope", available: true })]);

      const archive = await inject(
        GM,
        "DELETE",
        `/api/v1/campaigns/${ID.campaign}/items/${rope.id}?expectedAssetVersion=${rope.assetVersion}`,
      );

      expect(archive.statusCode).toBe(409);

      const usages = await expectStatus<{ typedUsages: { assetId: string; type: string }[] }>(
        await inject(GM, "GET", `/api/v1/campaigns/${ID.campaign}/items/${rope.id}/usages`),
        200,
      );

      expect(usages.typedUsages).toEqual([
        expect.objectContaining({ assetId: thief.assetId, type: "ACTOR_LOOT" }),
      ]);
    });

    it("takes only items the actor owns as carried loot and marks them once they are gone", async () => {
      const dagger = await createItem({
        name: "Dagger",
        category: "WEAPON",
        weaponCategory: "SIMPLE",
        weaponCombatType: "MELEE",
        damageDiceCount: 1,
        damageDiceFaces: 4,
        damageType: "PIERCING",
      });
      const bandit = await createOk({ name: "Bandit" });
      const other = await createOk({ name: "Other" });
      const owned = await giveItem(bandit, dagger.assetId, false);
      const foreign = await giveItem(other, dagger.assetId, false);

      expect(
        (await update(bandit, { loot: [{ key: "dagger", kind: "CARRIED_ITEM", itemInstanceId: foreign.id }] })).statusCode,
      ).toBe(409);

      const withLoot = await expectStatus<ActorBody>(
        await update(bandit, {
          loot: [
            { key: "dagger", kind: "CARRIED_ITEM", itemInstanceId: owned.id },
            { key: "coins", kind: "CURRENCY", currency: "GP", amount: "2d6" },
          ],
        }),
        200,
      );

      expect(withLoot.loot?.map((entry) => entry.available)).toEqual([true, true]);

      await expectStatus(
        await inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/item-instances/${owned.id}/transfer`, {
          expectedVersion: owned.version,
          ownerType: "ACTOR",
          ownerAssetId: other.assetId,
        }),
        200,
      );

      const after = await expectStatus<ActorBody>(await get(bandit.id), 200);

      expect(after.loot?.map((entry) => entry.available)).toEqual([false, true]);
      // A change elsewhere is not blocked by loot that changed hands.
      expect((await update(after, { notes: "Fled" })).statusCode).toBe(200);
    });

    it("links actors to factions as members (placeholder for the faction module)", async () => {
      const mira = await createOk();
      const link = (targetAssetId: string, metadata: Record<string, unknown> = {}) =>
        inject(GM, "POST", `/api/v1/campaigns/${ID.campaign}/assets/${mira.assetId}/links`, {
          targetAssetId,
          relationType: "MEMBER_OF",
          metadata,
        });

      expect((await link(ID.faction, { role: "Spy" })).statusCode).toBe(201);
      expect((await link(ID.location)).statusCode).toBe(400);
      expect(await db.select().from(assetLinks).where(eq(assetLinks.relationType, "MEMBER_OF"))).toHaveLength(1);

      const usages = await expectStatus<{ outgoing: { type: string; assetId: string }[] }>(
        await inject(GM, "GET", `${actorsUrl()}/${mira.id}/usages`),
        200,
      );

      expect(usages.outgoing).toEqual([expect.objectContaining({ type: "MEMBER_OF", assetId: ID.faction })]);
    });
  });
});
