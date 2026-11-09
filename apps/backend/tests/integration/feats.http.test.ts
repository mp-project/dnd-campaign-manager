import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { assets, campaignMemberships, campaigns, feats, rulesets, users } from "#core/db/schema";
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

type FeatBody = {
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
  selectable: boolean;
  descriptionHtml: string | null;
  prerequisites: unknown;
  choices: { key: string; options: { code: string }[] }[];
  featureGrants: { key: string; featureAssetId: string }[];
  releasedToPlayers?: boolean;
  rulesetIds?: string[];
  merged?: string[];
};

type FeatureBody = { id: string; assetId: string; version: number; assetVersion: number };

const ALERT = {
  name: "Alert",
  category: "GENERAL",
  description: "Always **ready** <script>alert(1)</script>",
};

const ELEMENTAL_ADEPT = {
  name: "Elemental Adept",
  category: "GENERAL",
  minimumCharacterLevel: 4,
  prerequisites: { type: "SPELLCASTING" },
  repeatability: { mode: "DISTINCT_BY_CHOICE", repeatabilityChoiceKey: "element" },
  choices: [
    {
      key: "element",
      label: "Damage type",
      choiceType: "DAMAGE_TYPE",
      minimumSelections: 1,
      maximumSelections: 1,
      options: ["acid", "cold", "fire"].map((code) => ({ code, label: code })),
    },
  ],
};

describe("feats", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/feats`;
  const catalogUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/catalog/feats`;
  const systemUrl = "/api/v1/feats";

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
    inject(as, "POST", url, { ...ALERT, ...payload });

  const createOk = async (payload: Record<string, unknown> = {}, as: TestActor = GM, url = campaignUrl()) =>
    expectStatus<FeatBody>(await create(payload, as, url), 201);

  const createSystem = (payload: Record<string, unknown> = {}, rulesetIds: string[] = [ID.ruleset]) =>
    createOk({ rulesetPolicy: "RESTRICTED", rulesetIds, ...payload }, ADMIN, systemUrl);

  const itemUrl = (item: { id: string; campaignId: string | null }) =>
    item.campaignId ? `${campaignUrl(item.campaignId)}/${item.id}` : `${systemUrl}/${item.id}`;

  const update = (item: FeatBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", itemUrl(item), {
      expectedVersion: item.version,
      expectedAssetVersion: item.assetVersion,
      ...payload,
    });

  const remove = (url: string, item: { assetVersion: number }, as: TestActor = GM) =>
    inject(as, "DELETE", `${url}?expectedAssetVersion=${item.assetVersion}`);

  const restore = (url: string, item: { assetVersion: number }, as: TestActor = GM) =>
    inject(as, "POST", `${url}/restore`, { expectedAssetVersion: item.assetVersion });

  const createFeature = async (payload: Record<string, unknown> = {}, campaignId: string = ID.campaign) =>
    expectStatus<FeatureBody>(
      await inject(GM, "POST", `/api/v1/campaigns/${campaignId}/features`, {
        name: "Tough",
        featureType: "PASSIVE",
        ...payload,
      }),
      201,
    );

  const featAssetCount = async () =>
    (await db.select().from(assets).where(eq(assets.assetType, "FEAT"))).length;

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "FEATS_2024", editionYear: 2024 },
        { id: ID.oldRuleset, code: "FEATS_2014", editionYear: 2014 },
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

  describe("custom feats", () => {
    it("creates asset and feat in one go and renders the description harmless", async () => {
      const item = await createOk();

      expect(item).toMatchObject({
        view: "FULL",
        campaignId: ID.campaign,
        name: "Alert",
        code: "alert",
        category: "GENERAL",
        status: "ACTIVE",
        selectable: true,
        releasedToPlayers: false,
        prerequisites: null,
        choices: [],
      });
      expect(item.descriptionHtml).toContain("<strong>ready</strong>");
      expect(item.descriptionHtml).not.toContain("<script");

      const read = await expectStatus<FeatBody>(await inject(EDITOR, "GET", itemUrl(item)), 200);

      expect(read.view).toBe("FULL");
    });

    it("refuses invalid bodies, missing rights and other campaigns", async () => {
      expect((await create({ category: "MYTHIC" })).statusCode).toBe(400);
      expect((await create({ repeatability: { mode: "LIMITED" } })).statusCode).toBe(400);
      expect((await create({ code: "Not A Slug" })).statusCode).toBe(400);
      expect((await create({}, PLAYER)).statusCode).toBe(403);
      expect((await create({}, OUTSIDER)).statusCode).toBe(404);

      const item = await createOk();

      expect((await inject(FOREIGN_GM, "GET", itemUrl(item))).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${campaignUrl(ID.foreignCampaign)}/${item.id}`)).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${campaignUrl()}/${ID.unknown}`)).statusCode).toBe(404);
      expect((await create({ name: "Other", code: "alert" })).statusCode).toBe(409);
    });

    it("updates parts with versions, reports conflicts and keeps a history", async () => {
      const item = await createOk();
      const updated = await expectStatus<FeatBody>(
        await update(item, { ...ELEMENTAL_ADEPT, name: "Alert!", repeatability: { mode: "UNLIMITED" } }),
        200,
      );

      expect(updated).toMatchObject({ name: "Alert!", category: "GENERAL", merged: [] });
      expect(updated.choices.map((choice) => choice.key)).toEqual(["element"]);
      // The definition parts are one unit: a stale change to one of them conflicts with the change
      // to the others; an unrelated field from the same stale version is merged.
      expect((await update(item, { featureGrants: [], prerequisites: { type: "LEVEL", minimumCharacterLevel: 2 } })).statusCode).toBe(412);
      expect((await update(item, { description: "Merged" })).statusCode).toBe(200);
      expect((await update(updated, { description: "x" }, PLAYER)).statusCode).toBe(403);

      const history = await expectStatus<{ data: { field: string }[] }>(
        await inject(GM, "GET", `/api/v1/history/feat/${item.id}`),
        200,
      );

      expect(history.data.map((entry) => entry.field)).toEqual(expect.arrayContaining(["choices", "repeatability"]));
      expect((await inject(PLAYER, "GET", `/api/v1/history/feat/${item.id}`)).statusCode).toBe(404);
    });

    it("archives and restores; archived feats cannot be changed", async () => {
      const item = await createOk();
      const archived = await expectStatus<FeatBody>(await remove(itemUrl(item), item), 200);

      expect(archived).toMatchObject({ status: "ARCHIVED", selectable: false });
      expect((await update(archived, { description: "x" })).statusCode).toBe(409);

      const listed = await expectStatus<{ data: FeatBody[] }>(await inject(GM, "GET", campaignUrl()), 200);

      expect(listed.data).toEqual([]);

      const restored = await expectStatus<FeatBody>(await restore(itemUrl(item), archived), 200);

      expect(restored.status).toBe("ACTIVE");
    });

    it("rolls the whole action back when a reference is missing", async () => {
      expect(
        (
          await create({
            prerequisites: { type: "FEAT", assetId: ID.unknown },
          })
        ).statusCode,
      ).toBe(404);
      expect(await featAssetCount()).toBe(0);
      expect((await db.select().from(feats)).length).toBe(0);
    });
  });

  describe("rules across rows", () => {
    it("refuses a feat as its own prerequisite and prerequisite cycles", async () => {
      const first = await createOk({ name: "First" });

      expect((await update(first, { prerequisites: { type: "FEAT", assetId: first.assetId } })).statusCode).toBe(409);

      const second = await createOk({ name: "Second", prerequisites: { type: "FEAT", assetId: first.assetId } });
      const third = await createOk({
        name: "Third",
        prerequisites: { type: "ALL", children: [{ type: "FEAT", assetId: second.assetId }, { type: "SPELLCASTING" }] },
      });
      const cycle = await update(first, { prerequisites: { type: "NOT", child: { type: "FEAT", assetId: third.assetId } } });

      expect(cycle.statusCode).toBe(409);
      expect(JSON.stringify(cycle.json())).toContain("cycle");
    });

    it("checks references by type, campaign and status", async () => {
      const feature = await createFeature();

      expect(
        (await create({ prerequisites: { type: "CLASS", assetId: feature.assetId } })).statusCode,
      ).toBe(409);
      expect(
        (await create({ featureGrants: [{ key: "tough", featureAssetId: feature.assetId }] })).statusCode,
      ).toBe(201);

      const otherFeature = await expectStatus<FeatureBody>(
        await inject(FOREIGN_GM, "POST", `/api/v1/campaigns/${ID.foreignCampaign}/features`, {
          name: "Foreign",
          featureType: "PASSIVE",
        }),
        201,
      );

      expect(
        (await create({ name: "Foreign", featureGrants: [{ key: "x", featureAssetId: otherFeature.assetId }] })).statusCode,
      ).toBe(404);
    });

    it("keeps referenced content from being archived and lists feats as usages", async () => {
      const feature = await createFeature();
      const required = await createOk({ name: "Required" });
      const item = await createOk({
        name: "Dependent",
        prerequisites: { type: "FEAT", assetId: required.assetId },
        featureGrants: [{ key: "tough", featureAssetId: feature.assetId }],
      });

      const archive = await inject(
        GM,
        "DELETE",
        `/api/v1/campaigns/${ID.campaign}/features/${feature.id}?expectedAssetVersion=${feature.assetVersion}`,
      );

      expect(archive.statusCode).toBe(409);
      expect((await remove(itemUrl(required), required)).statusCode).toBe(409);

      const usages = await expectStatus<{ typedUsages: { type: string; label: string }[] }>(
        await inject(GM, "GET", `${itemUrl(required)}/usages`),
        200,
      );

      expect(usages.typedUsages).toEqual([expect.objectContaining({ type: "FEAT_PREREQUISITE", label: "Dependent" })]);

      await expectStatus(await remove(itemUrl(item), item), 200);
      expect((await remove(itemUrl(required), required)).statusCode).toBe(200);
    });

    it("checks bindings against the parameters of the granted feature", async () => {
      const feature = await createFeature({
        parameters: [{ key: "bonus", valueType: "INTEGER", required: true }],
      });

      expect((await create({ featureGrants: [{ key: "g", featureAssetId: feature.assetId }] })).statusCode).toBe(409);
      expect(
        (
          await create({
            featureGrants: [
              {
                key: "g",
                featureAssetId: feature.assetId,
                bindings: [{ parameterKey: "bonus", bindingSource: "CONTEXT", contextKey: "proficiencyBonus" }],
              },
            ],
          })
        ).statusCode,
      ).toBe(201);
    });
  });

  describe("categories per ruleset", () => {
    it("allows 2024 categories only for rulesets of that edition", async () => {
      expect((await create({ category: "ORIGIN" })).statusCode).toBe(201);
      expect((await create({ category: "ORIGIN" }, GM, campaignUrl(ID.oldCampaign))).statusCode).toBe(409);
      expect((await create({ category: "GENERAL" }, GM, campaignUrl(ID.oldCampaign))).statusCode).toBe(201);
      expect(
        (await create({ category: "EPIC_BOON", rulesetPolicy: "NEUTRAL" }, ADMIN, systemUrl)).statusCode,
      ).toBe(409);
      expect(
        (
          await create(
            { category: "EPIC_BOON", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset, ID.oldRuleset] },
            ADMIN,
            systemUrl,
          )
        ).statusCode,
      ).toBe(409);
      expect((await createSystem({ category: "EPIC_BOON", name: "Boon" })).category).toBe("EPIC_BOON");
    });

    it("lists the categories of the campaign ruleset", async () => {
      const current = await expectStatus<{ categories: string[]; editionYear: number }>(
        await inject(PLAYER, "GET", `${catalogUrl()}/categories`),
        200,
      );
      const old = await expectStatus<{ categories: string[] }>(
        await inject(GM, "GET", `${catalogUrl(ID.oldCampaign)}/categories`),
        200,
      );

      expect(current).toMatchObject({ editionYear: 2024, categories: ["ORIGIN", "GENERAL", "FIGHTING_STYLE", "EPIC_BOON"] });
      expect(old.categories).toEqual(["GENERAL"]);
      expect((await inject(OUTSIDER, "GET", `${catalogUrl()}/categories`)).statusCode).toBe(404);
    });
  });

  describe("global feats", () => {
    it("are changed by administrators only and keep codes unique per ruleset", async () => {
      expect((await create({}, GM, systemUrl)).statusCode).toBe(403);

      const modern = await createSystem();

      expect(modern).toMatchObject({ campaignId: null, rulesetIds: [ID.ruleset] });
      expect((await create({ rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] }, ADMIN, systemUrl)).statusCode).toBe(409);
      expect((await createSystem({}, [ID.oldRuleset])).code).toBe("alert");

      const asPlayer = await expectStatus<FeatBody>(await inject(PLAYER, "GET", itemUrl(modern)), 200);

      expect(asPlayer.view).toBe("PLAYER");
      expect((await update(modern, { description: "x" }, GM)).statusCode).toBe(403);
    });
  });

  describe("catalog and player view", () => {
    it("shows players global feats of the ruleset and released custom ones", async () => {
      const global = await createSystem({ name: "Global" });
      await createSystem({ name: "Old" }, [ID.oldRuleset]);
      const custom = await createOk({ name: "Custom" });

      const before = await expectStatus<{ data: FeatBody[] }>(await inject(PLAYER, "GET", catalogUrl()), 200);

      expect(before.data.map((item) => item.name)).toEqual(["Global"]);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${custom.id}`)).statusCode).toBe(404);

      await expectStatus(await update(custom, { releasedToPlayers: true }), 200);

      const after = await expectStatus<{ data: FeatBody[] }>(await inject(PLAYER, "GET", catalogUrl()), 200);

      expect(after.data.map((item) => [item.name, item.view])).toEqual([
        ["Custom", "PLAYER"],
        ["Global", "PLAYER"],
      ]);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${global.id}`)).statusCode).toBe(200);
    });

    it("hides references and options the player may not see; granted features come with the release", async () => {
      const grantedFeature = await createFeature({ name: "Granted" });
      const hiddenFeat = await createOk({ name: "Hidden feat" });
      const item = await createOk({
        name: "Visible",
        releasedToPlayers: true,
        prerequisites: { type: "NOT", child: { type: "FEAT", assetId: hiddenFeat.assetId } },
        featureGrants: [{ key: "granted", featureAssetId: grantedFeature.assetId }],
        choices: [
          {
            key: "pick",
            label: "Pick",
            choiceType: "FEAT",
            minimumSelections: 1,
            maximumSelections: 1,
            options: [
              { code: "hidden", label: "Hidden", linkedAssetId: hiddenFeat.assetId },
              { code: "self", label: "Self" },
            ],
          },
        ],
      });
      const view = await expectStatus<FeatBody>(await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`), 200);

      expect(view.view).toBe("PLAYER");
      expect(view.prerequisites).toEqual({ type: "NOT", child: { type: "FEAT", assetId: null } });
      expect(view.choices[0]?.options.map((option) => option.code)).toEqual(["self"]);
      expect(JSON.stringify(view)).not.toContain(hiddenFeat.assetId);
      expect(view).not.toHaveProperty("releasedToPlayers");

      // The released feat makes the custom feature it grants visible to players.
      const features = await expectStatus<{ grants: { featureAssetId: string }[] }>(
        await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}/features`),
        200,
      );

      expect(features.grants.map((grant) => grant.featureAssetId)).toEqual([grantedFeature.assetId]);

      const feature = await inject(PLAYER, "GET", `/api/v1/campaigns/${ID.campaign}/catalog/features/${grantedFeature.id}`);

      expect(feature.statusCode).toBe(200);

      // Withdrawing the release hides the feat and with it the feature.
      const current = await expectStatus<FeatBody>(await inject(GM, "GET", itemUrl(item)), 200);

      await expectStatus(await update(current, { releasedToPlayers: false }), 200);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`)).statusCode).toBe(404);
      expect(
        (await inject(PLAYER, "GET", `/api/v1/campaigns/${ID.campaign}/catalog/features/${grantedFeature.id}`)).statusCode,
      ).toBe(404);
    });

    it("filters the catalog by category, level and repeatability", async () => {
      await createOk({ name: "Origin", category: "ORIGIN" });
      await createOk({ ...ELEMENTAL_ADEPT });
      await createOk({ name: "Boon", category: "EPIC_BOON", minimumCharacterLevel: 19 });

      const names = async (query: string) =>
        (await expectStatus<{ data: FeatBody[] }>(await inject(GM, "GET", `${catalogUrl()}?${query}`), 200)).data
          .map((item) => item.name)
          .sort();

      expect(await names("category=ORIGIN")).toEqual(["Origin"]);
      expect(await names("level=4")).toEqual(["Elemental Adept", "Origin"]);
      expect(await names("repeatable=true")).toEqual(["Elemental Adept"]);
      expect(await names("repeatable=false")).toEqual(["Boon", "Origin"]);
    });
  });

  describe("eligibility and resolution", () => {
    it("checks a snapshot: unknown, ineligible with reasons, eligible", async () => {
      const item = await createOk({ ...ELEMENTAL_ADEPT, releasedToPlayers: true });
      const check = (body: Record<string, unknown>, as: TestActor = GM) =>
        inject(as, "POST", `${catalogUrl()}/${item.id}/eligibility-check`, body);

      const unknown = await expectStatus<{ outcome: string; unknownFacts: string[] }>(await check({}), 200);

      expect(unknown).toMatchObject({ outcome: "UNKNOWN", unknownFacts: ["characterLevel", "feats", "spellcasting"] });

      const failed = await expectStatus<{ outcome: string; reasons: { code: string }[] }>(
        await check({ actor: { characterLevel: 3, spellcasting: false, feats: [] } }),
        200,
      );

      expect(failed.outcome).toBe("INELIGIBLE");
      expect(failed.reasons.map((reason) => reason.code).sort()).toEqual(["MINIMUM_LEVEL", "PREREQUISITE"]);

      const ok = await expectStatus<{
        outcome: string;
        eligible: boolean;
        allowedChoices: { key: string; options: { code: string }[]; excludedValues: string[] }[];
      }>(
        await check(
          {
            acquisitionContext: { characterLevel: 4, allowedCategories: ["GENERAL"] },
            actor: { spellcasting: true, feats: [{ featAssetId: item.assetId, choices: { element: ["fire"] } }] },
          },
          PLAYER,
        ),
        200,
      );

      expect(ok).toMatchObject({ outcome: "ELIGIBLE", eligible: true });
      expect(ok.allowedChoices[0]).toMatchObject({ key: "element", excludedValues: ["fire"] });
      expect(ok.allowedChoices[0]?.options.map((option) => option.code)).toEqual(["acid", "cold"]);
      expect((await check({ actor: { characterLevel: 30 } })).statusCode).toBe(400);
      expect((await check({}, OUTSIDER)).statusCode).toBe(404);
    });

    it("resolves choices and granted features", async () => {
      const feature = await createFeature({
        parameters: [{ key: "element", valueType: "TEXT", required: true }],
      });
      const item = await createOk({
        ...ELEMENTAL_ADEPT,
        featureGrants: [
          {
            key: "mastery",
            featureAssetId: feature.assetId,
            bindings: [{ parameterKey: "element", bindingSource: "FEAT_CHOICE", choiceKey: "element" }],
          },
        ],
      });
      const resolve = (body: Record<string, unknown>) =>
        inject(GM, "POST", `${catalogUrl()}/${item.id}/resolve`, body);

      const resolved = await expectStatus<{
        choices: Record<string, string[]>;
        grants: { key: string; status: string; resolved: unknown }[];
      }>(await resolve({ characterLevel: 4, choices: { element: ["fire"] } }), 200);

      expect(resolved.choices).toEqual({ element: ["fire"] });
      expect(resolved.grants.map((grant) => [grant.key, grant.status, grant.resolved !== null])).toEqual([
        ["mastery", "APPLIED", true],
      ]);
      expect((await resolve({ choices: { element: ["lightning"] } })).statusCode).toBe(409);
      expect((await resolve({ choices: {} })).statusCode).toBe(409);
      expect((await resolve({ choices: { other: ["x"], element: ["fire"] } })).statusCode).toBe(409);
    });
  });

  describe("validate", () => {
    it("reports the issues of a stored definition", async () => {
      const item = await createOk();

      await db.update(feats).set({ repeatability: { mode: "LIMITED" } }).where(eq(feats.id, item.id));

      const result = await expectStatus<{ valid: boolean; issues: unknown[] }>(
        await inject(GM, "POST", `${itemUrl(item)}/validate`),
        200,
      );

      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
      expect((await inject(GM, "GET", `${catalogUrl()}/${item.id}/choices`)).statusCode).toBe(409);
      expect((await inject(PLAYER, "POST", `${itemUrl(item)}/validate`)).statusCode).toBe(403);
    });
  });
});
