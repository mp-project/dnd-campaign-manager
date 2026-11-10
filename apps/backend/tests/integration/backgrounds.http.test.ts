import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { assets, backgrounds, campaignMemberships, campaigns, rulesets, users } from "#core/db/schema";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

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

const actor = (actorId: string, systemRole: TestActor["systemRole"] = "USER"): TestActor => ({ actorId, systemRole });

const GM = actor(ID.gm);
const EDITOR = actor(ID.editor);
const PLAYER = actor(ID.player);
const OUTSIDER = actor(ID.outsider);
const FOREIGN_GM = actor(ID.foreignGm);
const ADMIN = actor(ID.admin, "ADMIN");

type Body = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  campaignId: string | null;
  status: string;
  code: string;
  name: string;
  selectable: boolean;
  customizationMode: string;
  descriptionHtml: string | null;
  sections: { key: string }[];
  sectionsHtml: { key: string; contentHtml: string }[];
  abilityRule: { mode: string };
  featGrants: { key: string }[];
  featureGrants: { key: string }[];
  proficiencyGrants: { key: string; options: unknown[] }[];
  equipmentOptions: { code: string; entries: { key: string }[] }[];
  releasedToPlayers?: boolean;
  merged?: string[];
};

type Created = { id: string; assetId: string; version: number; assetVersion: number };

describe("backgrounds", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/backgrounds`;
  const catalogUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/catalog/backgrounds`;
  const systemUrl = "/api/v1/backgrounds";

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

  const itemUrl = (item: { id: string; campaignId: string | null }) =>
    item.campaignId ? `${campaignUrl(item.campaignId)}/${item.id}` : `${systemUrl}/${item.id}`;

  const update = (item: Body, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", itemUrl(item), {
      expectedVersion: item.version,
      expectedAssetVersion: item.assetVersion,
      ...payload,
    });

  const createIn = async <T = Created>(path: string, payload: Record<string, unknown>, campaignId: string = ID.campaign) =>
    expectStatus<T>(
      await inject(campaignId === ID.foreignCampaign ? FOREIGN_GM : GM, "POST", `/api/v1/campaigns/${campaignId}/${path}`, payload),
      201,
    );

  /** Origin feat, tool, gear and a feature of the 2024 campaign. */
  const fixtures = async (campaignId: string = ID.campaign) => ({
    feat: await createIn("feats", { name: "Magic Initiate", category: campaignId === ID.oldCampaign ? "GENERAL" : "ORIGIN" }, campaignId),
    tool: await createIn("items", { name: "Calligrapher's Supplies", category: "TOOL", toolCategory: "ARTISANS_TOOLS" }, campaignId),
    // Released, so players may choose it for an equipment choice.
    book: await createIn("items", { name: "Prayer Book", category: "ADVENTURING_GEAR", releasedToPlayers: true }, campaignId),
    feature: await createIn("features", { name: "Shelter of the Faithful", featureType: "PASSIVE" }, campaignId),
  });

  type Fixtures = Awaited<ReturnType<typeof fixtures>>;

  const acolyte2024 = (f: Fixtures) => ({
    name: "Acolyte",
    description: "Served in a **temple** <script>alert(1)</script>",
    sections: [
      { key: "hook", title: "Hook", content: "The temple hides a *secret*.", gmOnly: true },
      { key: "life", title: "Temple life", content: "Prayers at dawn." },
    ],
    abilityRule: { mode: "CHOOSE_2024", allowedAbilities: ["int", "wis", "cha"] },
    proficiencyGrants: [
      { key: "skills", type: "SKILL", selectionMode: "FIXED", options: [{ code: "insight" }, { code: "religion" }] },
      { key: "tool", type: "TOOL", selectionMode: "FIXED", options: [{ assetId: f.tool.assetId }] },
    ],
    featGrants: [{ key: "origin_feat", selectionMode: "FIXED", featAssetId: f.feat.assetId }],
    equipmentOptions: [
      {
        code: "a",
        name: "Gear",
        optionType: "MIXED",
        currency: { GP: 8 },
        entries: [
          { key: "tool", itemAssetId: f.tool.assetId },
          { key: "book", choiceFilter: { categories: ["ADVENTURING_GEAR"] } },
        ],
      },
      { code: "b", name: "Coins", optionType: "CURRENCY", currency: { GP: 50 } },
    ],
    promptTables: [
      {
        key: "ideal",
        promptType: "IDEAL",
        title: "Ideal",
        rollDie: 4,
        options: [
          { rollMin: 1, rollMax: 2, text: "Tradition." },
          { rollMin: 3, rollMax: 4, text: "Charity." },
        ],
      },
    ],
  });

  const sage2014 = (f: Fixtures) => ({
    name: "Sage",
    customizationMode: "RULESET_CUSTOMIZABLE",
    proficiencyGrants: [
      { key: "skills", type: "SKILL", selectionMode: "FIXED", options: [{ code: "arcana" }, { code: "history" }] },
      { key: "languages", type: "LANGUAGE", selectionMode: "CHOOSE", choiceCount: 2 },
    ],
    featureGrants: [{ key: "researcher", featureAssetId: f.feature.assetId }],
  });

  const createOk = async (payload: Record<string, unknown>, as: TestActor = GM, url = campaignUrl()) =>
    expectStatus<Body>(await inject(as, "POST", url, payload), 201);

  const backgroundAssetCount = async () =>
    (await db.select().from(assets).where(eq(assets.assetType, "BACKGROUND"))).length;

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "BG_2024", editionYear: 2024 },
        { id: ID.oldRuleset, code: "BG_2014", editionYear: 2014 },
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
      { campaignId: ID.oldCampaign, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.foreignCampaign, userId: ID.foreignGm, role: "EDITOR", createdBy: ID.foreignGm },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("custom backgrounds", () => {
    it("creates a 2024 background with asset, renders text harmless and keeps the GM-only section to GMs", async () => {
      const f = await fixtures();
      const item = await createOk(acolyte2024(f));

      expect(item).toMatchObject({
        view: "FULL",
        campaignId: ID.campaign,
        code: "acolyte",
        status: "ACTIVE",
        selectable: true,
        releasedToPlayers: false,
        customizationMode: "FIXED",
        abilityRule: { mode: "CHOOSE_2024" },
      });
      expect(item.descriptionHtml).toContain("<strong>temple</strong>");
      expect(item.descriptionHtml).not.toContain("<script");
      expect(item.sections.map((section) => section.key)).toEqual(["hook", "life"]);

      // Unreleased: players don't see it at all.
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`)).statusCode).toBe(404);

      const released = await expectStatus<Body>(await update(item, { releasedToPlayers: true }), 200);
      const view = await expectStatus<Body>(await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`), 200);

      expect(view.view).toBe("PLAYER");
      expect(view.sections.map((section) => section.key)).toEqual(["life"]);
      expect(view.sectionsHtml.map((section) => section.key)).toEqual(["life"]);
      expect(JSON.stringify(view)).not.toContain("secret");
      expect(view).not.toHaveProperty("rulesetIds");
      expect(view).not.toHaveProperty("version");
      // The release makes the custom feat, tool and gear it grants visible to players.
      expect(view.featGrants.map((grant) => grant.key)).toEqual(["origin_feat"]);
      expect(view.proficiencyGrants[1]?.options).toHaveLength(1);
      expect(released.releasedToPlayers).toBe(true);
    });

    it("refuses invalid bodies, missing rights, other campaigns and taken codes", async () => {
      const f = await fixtures();

      expect((await inject(GM, "POST", campaignUrl(), { name: "X", abilityRule: { mode: "CHOOSE_2024" } })).statusCode).toBe(400);
      expect((await inject(GM, "POST", campaignUrl(), { name: "X", code: "Not A Slug" })).statusCode).toBe(400);
      expect((await inject(PLAYER, "POST", campaignUrl(), acolyte2024(f))).statusCode).toBe(403);
      expect((await inject(OUTSIDER, "POST", campaignUrl(), acolyte2024(f))).statusCode).toBe(404);

      const item = await createOk(acolyte2024(f));

      expect((await inject(FOREIGN_GM, "GET", itemUrl(item))).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${campaignUrl(ID.foreignCampaign)}/${item.id}`)).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${campaignUrl()}/${ID.unknown}`)).statusCode).toBe(404);
      // Unique code per campaign (partial unique index).
      expect((await inject(GM, "POST", campaignUrl(), { ...acolyte2024(f), name: "Other", code: "acolyte" })).statusCode).toBe(409);
    });

    it("rolls the whole action back when a check at its end fails", async () => {
      const f = await fixtures();
      const before = await backgroundAssetCount();
      const missing = { ...acolyte2024(f), featGrants: [{ key: "origin_feat", selectionMode: "FIXED", featAssetId: ID.unknown }] };
      const foreign = await fixtures(ID.foreignCampaign);
      const otherCampaign = { ...acolyte2024(f), featGrants: [{ key: "origin_feat", selectionMode: "FIXED", featAssetId: foreign.feat.assetId }] };

      expect((await inject(GM, "POST", campaignUrl(), missing)).statusCode).toBe(404);
      expect((await inject(GM, "POST", campaignUrl(), otherCampaign)).statusCode).toBe(404);
      expect(await backgroundAssetCount()).toBe(before);
    });

    it("applies the edition rules of the campaign ruleset", async () => {
      const f = await fixtures();
      const old = await fixtures(ID.oldCampaign);

      // 2024: ability increases are distributed, no customization, origin feats only.
      expect((await inject(GM, "POST", campaignUrl(), { name: "Plain" })).statusCode).toBe(409);
      expect(
        (await inject(GM, "POST", campaignUrl(), { ...acolyte2024(f), customizationMode: "RULESET_CUSTOMIZABLE" })).statusCode,
      ).toBe(409);

      const general = await createIn("feats", { name: "Alert", category: "GENERAL" });

      expect(
        (
          await inject(GM, "POST", campaignUrl(), {
            ...acolyte2024(f),
            featGrants: [{ key: "origin_feat", selectionMode: "FIXED", featAssetId: general.assetId }],
          })
        ).statusCode,
      ).toBe(409);

      // 2014: no distributed increases; customization is allowed.
      expect(
        (
          await inject(GM, "POST", campaignUrl(ID.oldCampaign), {
            ...sage2014(old),
            abilityRule: { mode: "CHOOSE_2024", allowedAbilities: ["int", "wis", "cha"] },
          })
        ).statusCode,
      ).toBe(409);
      await createOk(sage2014(old), GM, campaignUrl(ID.oldCampaign));
    });

    it("keeps its rules when referenced feats and items change later", async () => {
      const f = await fixtures();
      const item = await createOk(acolyte2024(f));
      const feat = await expectStatus<Created>(await inject(GM, "GET", `/api/v1/campaigns/${ID.campaign}/feats/${f.feat.id}`), 200);
      const tool = await expectStatus<Created>(await inject(GM, "GET", `/api/v1/campaigns/${ID.campaign}/items/${f.tool.id}`), 200);

      // The origin feat may not become a general feat while the background grants it.
      expect(
        (
          await inject(GM, "PATCH", `/api/v1/campaigns/${ID.campaign}/feats/${f.feat.id}`, {
            category: "GENERAL",
            expectedVersion: feat.version,
            expectedAssetVersion: feat.assetVersion,
          })
        ).statusCode,
      ).toBe(409);
      // The tool may not stop being a tool.
      expect(
        (
          await inject(GM, "PATCH", `/api/v1/campaigns/${ID.campaign}/items/${f.tool.id}`, {
            category: "ADVENTURING_GEAR",
            toolCategory: null,
            expectedVersion: tool.version,
            expectedAssetVersion: tool.assetVersion,
          })
        ).statusCode,
      ).toBe(409);
      // Referenced assets can't be archived.
      expect(
        (
          await inject(
            GM,
            "DELETE",
            `/api/v1/campaigns/${ID.campaign}/feats/${f.feat.id}?expectedAssetVersion=${feat.assetVersion}`,
          )
        ).statusCode,
      ).toBe(409);

      const usages = await expectStatus<{ typedUsages: { assetId: string; type: string }[] }>(
        await inject(GM, "GET", `/api/v1/campaigns/${ID.campaign}/catalog/feats/${f.feat.id}/usages`),
        200,
      );

      expect(usages.typedUsages).toEqual([expect.objectContaining({ assetId: item.assetId, type: "BACKGROUND_DEFINITION" })]);
    });

    it("updates parts with versions, reports conflicts and keeps a history", async () => {
      const f = await fixtures();
      const item = await createOk(acolyte2024(f));
      const updated = await expectStatus<Body>(
        await update(item, { name: "Acolyte!", promptTables: [], description: "New" }),
        200,
      );

      expect(updated).toMatchObject({ name: "Acolyte!", merged: [] });
      // The definition parts are one unit: a stale change to one of them is a conflict.
      expect((await update(item, { sections: [] })).statusCode).toBe(412);
      expect((await update(item, { displayOrder: 3 })).statusCode).toBe(200);
      expect((await update(updated, { description: "x" }, PLAYER)).statusCode).toBe(403);

      const history = await expectStatus<{ data: { field: string }[] }>(
        await inject(GM, "GET", `/api/v1/history/background/${item.id}`),
        200,
      );

      expect(history.data.map((entry) => entry.field)).toEqual(expect.arrayContaining(["promptTables", "description"]));
      expect((await inject(PLAYER, "GET", `/api/v1/history/background/${item.id}`)).statusCode).toBe(404);
    });

    it("archives (soft delete) and restores; archived backgrounds can't change", async () => {
      const f = await fixtures();
      const item = await createOk(acolyte2024(f));
      const archived = await expectStatus<Body>(
        await inject(EDITOR, "DELETE", `${itemUrl(item)}?expectedAssetVersion=${item.assetVersion}`),
        200,
      );

      expect(archived).toMatchObject({ status: "ARCHIVED", selectable: false });
      expect((await update(archived, { description: "x" })).statusCode).toBe(409);

      const list = await expectStatus<{ data: { id: string }[] }>(await inject(GM, "GET", campaignUrl()), 200);

      expect(list.data.map((entry) => entry.id)).not.toContain(item.id);

      const rows = await db.select().from(backgrounds).where(eq(backgrounds.id, item.id));

      expect(rows[0]?.deletedAt).toBeNull();

      const restored = await expectStatus<Body>(
        await inject(GM, "POST", `${itemUrl(item)}/restore`, { expectedAssetVersion: archived.assetVersion }),
        200,
      );

      expect(restored.status).toBe("ACTIVE");
    });

    it("lists with filters and validates stored definitions", async () => {
      const f = await fixtures();
      const item = await createOk(acolyte2024(f));
      const list = async (query: string) =>
        expectStatus<{ data: { id: string; abilities: string[] }[] }>(
          await inject(GM, "GET", `${campaignUrl()}?${query}`),
          200,
        );

      expect((await list("ability=wis")).data.map((entry) => entry.id)).toEqual([item.id]);
      expect((await list("ability=str")).data).toEqual([]);
      expect((await list("abilityMode=CHOOSE_2024")).data[0]?.abilities).toEqual(["int", "wis", "cha"]);

      const validation = await expectStatus<{ valid: boolean; issues: unknown[] }>(
        await inject(GM, "POST", `${itemUrl(item)}/validate`),
        200,
      );

      expect(validation).toEqual({ backgroundId: item.id, valid: true, issues: [] });

      // A definition broken outside the API answers 409 on reads and is named by validate.
      await db.update(backgrounds).set({ promptTables: [{ key: "x" }] }).where(eq(backgrounds.id, item.id));

      expect((await inject(GM, "GET", itemUrl(item))).statusCode).toBe(409);
      expect(
        (await expectStatus<{ valid: boolean }>(await inject(GM, "POST", `${itemUrl(item)}/validate`), 200)).valid,
      ).toBe(false);
    });
  });

  describe("catalog and preview", () => {
    it("previews a 2024 background without writing anything", async () => {
      const f = await fixtures();
      const item = await createOk({ ...acolyte2024(f), releasedToPlayers: true });
      const resolveUrl = `${catalogUrl()}/${item.id}/resolve`;
      const historyCount = async () => (await pool.query("select count(*)::int as count from entity_change_events")).rows[0].count;
      const before = await historyCount();
      const preview = await expectStatus<Record<string, unknown>>(
        await inject(PLAYER, "POST", resolveUrl, {
          abilityAllocations: { wis: 2, cha: 1 },
          equipmentChoice: { optionCode: "a", itemChoices: { book: f.book.assetId } },
          promptSelections: [{ tableKey: "ideal", roll: 3 }],
          actor: { proficiencies: ["skill.insight"] },
        }),
        200,
      );

      expect(preview).toMatchObject({
        view: "PLAYER",
        sourceAssetId: item.assetId,
        selectionMode: "STANDARD",
        abilityIncreases: { wis: 2, cha: 1 },
        feats: [{ grantKey: "origin_feat", featAssetId: f.feat.assetId, featId: f.feat.id, chosen: false }],
        equipment: {
          optionCode: "a",
          walletDelta: { GP: 8 },
          items: [
            { entryKey: "tool", itemAssetId: f.tool.assetId, quantity: 1 },
            { entryKey: "book", itemAssetId: f.book.assetId, quantity: 1 },
          ],
        },
        prompts: [{ tableKey: "ideal", promptType: "IDEAL", text: "Charity.", roll: 3, custom: false }],
        conflicts: [
          expect.objectContaining({ code: "DUPLICATE_PROFICIENCY", proficiencyKey: "skill.insight", featAssetId: null }),
        ],
      });
      expect(await historyCount()).toBe(before);

      const invalid = await inject(PLAYER, "POST", resolveUrl, {
        abilityAllocations: { wis: 3 },
        equipmentChoice: { optionCode: "a", itemChoices: { book: f.tool.assetId } },
      });

      expect(invalid.statusCode).toBe(409);
      expect(JSON.stringify(invalid.json())).toContain("The item does not fit the choice");
      expect((await inject(PLAYER, "POST", resolveUrl, { abilityAllocations: { wis: "two" } })).statusCode).toBe(400);
      expect((await inject(OUTSIDER, "POST", resolveUrl, {})).statusCode).toBe(404);
    });

    it("never offers or accepts a feat twice and shows the features of a feat it makes visible", async () => {
      const f = await fixtures();
      const skilled = await createIn("feats", {
        name: "Skilled",
        category: "ORIGIN",
        featureGrants: [{ key: "skills", featureAssetId: f.feature.assetId }],
      });
      const item = await createOk({
        ...acolyte2024(f),
        releasedToPlayers: true,
        featGrants: [
          { key: "origin_feat", selectionMode: "FIXED", featAssetId: f.feat.assetId },
          {
            key: "extra",
            selectionMode: "CHOOSE",
            optionFilter: { categories: ["ORIGIN"], featAssetIds: [f.feat.assetId, skilled.assetId] },
          },
        ],
      });
      const url = `${catalogUrl()}/${item.id}`;
      type Options = { grants: { grantKey: string; options: { featAssetId: string; available: boolean }[] }[] };
      const options = async (as: TestActor, existingFeatAssetIds: string[] = []) =>
        (await expectStatus<Options>(await inject(as, "POST", `${url}/feat-options`, { existingFeatAssetIds }), 200)).grants;

      // The fixed origin feat is taken through the background, so the choice doesn't offer it again.
      expect(await options(GM)).toEqual([
        { grantKey: "origin_feat", selectionMode: "FIXED", truncated: false, options: [expect.objectContaining({ featAssetId: f.feat.assetId, available: true })] },
        { grantKey: "extra", selectionMode: "CHOOSE", truncated: false, options: [expect.objectContaining({ featAssetId: skilled.assetId })] },
      ]);
      // A character that has Skilled already gets nothing to choose; one that has the fixed feat sees it unavailable.
      expect((await options(GM, [skilled.assetId]))[1]?.options).toEqual([]);
      expect((await options(GM, [f.feat.assetId]))[0]?.options[0]?.available).toBe(false);
      // Players get the same options through the release, and the feat shows its custom feature.
      expect((await options(PLAYER))[1]?.options.map((option) => option.featAssetId)).toEqual([skilled.assetId]);

      const features = await expectStatus<{ grants: { featureAssetId: string }[] }>(
        await inject(PLAYER, "GET", `/api/v1/campaigns/${ID.campaign}/catalog/feats/${skilled.id}/features`),
        200,
      );

      expect(features.grants.map((grant) => grant.featureAssetId)).toEqual([f.feature.assetId]);

      const base = {
        abilityAllocations: { wis: 2, cha: 1 },
        equipmentChoice: { optionCode: "b" },
      };
      const twice = await inject(GM, "POST", `${url}/resolve`, { ...base, featChoices: { extra: f.feat.assetId } });

      expect(twice.statusCode).toBe(409);
      expect(JSON.stringify(twice.json())).toContain("can't be taken again");
      expect(
        (await inject(GM, "POST", `${url}/resolve`, { ...base, featChoices: { extra: skilled.assetId }, existingFeatAssetIds: [skilled.assetId] }))
          .statusCode,
      ).toBe(409);

      const owned = await expectStatus<{ conflicts: { code: string; featAssetId: string | null }[] }>(
        await inject(GM, "POST", `${url}/resolve`, {
          ...base,
          featChoices: { extra: skilled.assetId },
          existingFeatAssetIds: [f.feat.assetId],
        }),
        200,
      );

      expect(owned.conflicts).toEqual([expect.objectContaining({ code: "DUPLICATE_FEAT", featAssetId: f.feat.assetId })]);
    });

    it("makes items bound to a granted feature visible with the release", async () => {
      const f = await fixtures();
      const relic = await createIn("items", { name: "Holy Relic", category: "ADVENTURING_GEAR" });
      const blessing = await createIn("features", {
        name: "Blessing",
        featureType: "PASSIVE",
        parameters: [{ key: "relic", valueType: "ASSET_REF", required: true }],
      });
      const item = await createOk({
        ...acolyte2024(f),
        releasedToPlayers: true,
        featureGrants: [
          {
            key: "blessing",
            featureAssetId: blessing.assetId,
            bindings: [{ parameterKey: "relic", bindingSource: "STATIC", staticValue: relic.assetId }],
          },
        ],
      });
      const view = await expectStatus<{ featureGrants: { bindings: { staticValue: unknown }[] }[] }>(
        await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`),
        200,
      );

      expect(view.featureGrants[0]?.bindings).toEqual([expect.objectContaining({ staticValue: relic.assetId })]);
      expect((await inject(PLAYER, "GET", `/api/v1/campaigns/${ID.campaign}/catalog/items/${relic.id}`)).statusCode).toBe(200);
    });

    it("previews a 2014 background with its customization and resolves granted features", async () => {
      const old = await fixtures(ID.oldCampaign);
      const sage = await createOk(sage2014(old), GM, campaignUrl(ID.oldCampaign));
      const other = await createIn("features", { name: "Discovery", featureType: "PASSIVE" }, ID.oldCampaign);
      const hermit = await createOk(
        { name: "Hermit", featureGrants: [{ key: "discovery", featureAssetId: other.assetId }] },
        GM,
        campaignUrl(ID.oldCampaign),
      );
      const resolveUrl = `${catalogUrl(ID.oldCampaign)}/${sage.id}/resolve`;
      const standard = await expectStatus<{ features: { featureAssetId: string; resolved: unknown }[] }>(
        await inject(GM, "POST", resolveUrl, { proficiencyChoices: { languages: ["elvish", "dwarvish"] } }),
        200,
      );

      expect(standard.features).toEqual([
        expect.objectContaining({ featureAssetId: old.feature.assetId, sourceAssetId: sage.assetId, resolved: expect.anything() }),
      ]);

      const customized = await expectStatus<{
        selectionMode: string;
        proficiencies: { proficiencyKey: string; grantKey: string | null }[];
        features: { featureAssetId: string; sourceAssetId: string }[];
      }>(
        await inject(GM, "POST", resolveUrl, {
          customization: {
            skills: ["stealth", "survival"],
            toolsAndLanguages: [
              { type: "TOOL", value: old.tool.assetId },
              { type: "LANGUAGE", value: "elvish" },
            ],
            featureBackgroundAssetId: hermit.assetId,
          },
        }),
        200,
      );

      expect(customized.selectionMode).toBe("RULESET_CUSTOMIZED");
      expect(customized.proficiencies.map((item) => item.proficiencyKey)).toEqual([
        "skill.stealth",
        "skill.survival",
        `tool.${old.tool.assetId}`,
        "language.elvish",
      ]);
      expect(customized.features).toEqual([
        expect.objectContaining({ featureAssetId: other.assetId, sourceAssetId: hermit.assetId }),
      ]);

      // A tool proficiency must name a tool.
      expect(
        (
          await inject(GM, "POST", resolveUrl, {
            customization: {
              skills: ["stealth", "survival"],
              toolsAndLanguages: [
                { type: "TOOL", value: old.book.assetId },
                { type: "LANGUAGE", value: "elvish" },
              ],
            },
          })
        ).statusCode,
      ).toBe(409);
    });

    it("lists global backgrounds of the campaign ruleset next to the campaign's own", async () => {
      const f = await fixtures();
      const global = await createOk(
        {
          name: "Soldier",
          rulesetPolicy: "RESTRICTED",
          rulesetIds: [ID.ruleset],
          abilityRule: { mode: "CHOOSE_2024", allowedAbilities: ["str", "dex", "con"] },
        },
        ADMIN,
        systemUrl,
      );
      const own = await createOk(acolyte2024(f));
      const catalog = await expectStatus<{ data: { id: string }[] }>(await inject(PLAYER, "GET", catalogUrl()), 200);

      expect(catalog.data.map((entry) => entry.id)).toEqual([global.id]);

      const gm = await expectStatus<{ data: { id: string }[] }>(await inject(GM, "GET", catalogUrl()), 200);

      expect(gm.data.map((entry) => entry.id).sort()).toEqual([global.id, own.id].sort());

      const section = await expectStatus<{ abilityRule: { mode: string } }>(
        await inject(PLAYER, "GET", `${catalogUrl()}/${global.id}/abilities`),
        200,
      );

      expect(section.abilityRule.mode).toBe("CHOOSE_2024");
      // Global backgrounds are changed by administrators only.
      expect((await inject(GM, "POST", systemUrl, { name: "Sailor" })).statusCode).toBe(403);
      expect((await inject(PLAYER, "GET", `${systemUrl}/${global.id}`)).statusCode).toBe(200);
    });
  });
});
