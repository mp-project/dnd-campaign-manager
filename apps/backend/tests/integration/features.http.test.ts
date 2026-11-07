import { eq } from "drizzle-orm";

import type { AppModule } from "#core/app/moduleSystem";
import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetRulesets,
  assets,
  campaignMemberships,
  campaigns,
  features,
  rulesets,
  users,
} from "#core/db/schema";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import { defaultAppModules } from "#src/modules/index";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

/** Stands in for the character modules: assets the campaign still uses. */
const inUseAssetIds = new Set<string>();

const inUseModule: AppModule = {
  name: "test-features-in-use",
  dependencies: ["assets"],
  register: (_app, container) => {
    container.dependencies
      .require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES)
      .service.registerInUseProvider({
        name: "test-characters",
        listInUseAssetIds: async () => [...inUseAssetIds],
      });
  },
};

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
  feat: "e0000000-0000-4000-8000-000000000001",
  hiddenFeat: "e0000000-0000-4000-8000-000000000002",
  foreignFeat: "e0000000-0000-4000-8000-000000000003",
  archivedFeat: "e0000000-0000-4000-8000-000000000004",
  systemFeat: "e0000000-0000-4000-8000-000000000005",
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

type FeatureBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  scope: string;
  status: string;
  code: string;
  name: string;
  description: string | null;
  descriptionHtml: string | null;
  campaignId: string | null;
  rulesetIds: string[];
  choices: { options: { code: string; linkedAssetId: string | null }[] }[];
  supersedes: { targetAssetId: string; mode: string }[];
  effects: unknown[];
  merged?: string[];
};

const constant = (value: number) => ({ type: "CONST", value });
const variable = (key: string) => ({ type: "VAR", key });

/** A feature that uses parameters, scaling, resources, an activation and effects. */
const KI = {
  name: "Ki",
  featureType: "RESOURCE",
  description: "Spend **ki** <script>alert(1)</script>",
  parameters: [{ key: "bonus", valueType: "INTEGER", defaultValue: 1 }],
  scalingTracks: [
    {
      key: "points",
      valueType: "INTEGER",
      scaleBy: "CLASS_LEVEL",
      values: [
        { minimumLevel: 2, value: 2 },
        { minimumLevel: 5, value: 5 },
      ],
    },
  ],
  resources: [
    { key: "ki", name: "Ki", maximumExpression: variable("scale.points"), recovery: "SHORT_REST" },
  ],
  activations: [
    {
      key: "flurry",
      activationType: "BONUS_ACTION",
      costs: [{ costType: "RESOURCE", resourceKey: "ki", amountExpression: constant(1) }],
    },
  ],
  effects: [
    {
      key: "speed",
      displayOrder: 0,
      payload: { type: "MOVEMENT", mode: "walk", distance: variable("param.bonus") },
    },
  ],
};

describe("features", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/features`;
  const catalogUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/catalog/features`;
  const systemUrl = "/api/v1/features";

  const create = (payload: Record<string, unknown>, as: TestActor = GM, url = campaignUrl()) =>
    session.injectAs(as, { method: "POST", url, payload });

  const createOk = async (
    payload: Record<string, unknown> = {},
    as: TestActor = GM,
    url = campaignUrl(),
  ) => {
    const response = await create({ name: "Rage", featureType: "ACTIVE", ...payload }, as, url);

    expect({ status: response.statusCode, body: response.statusCode === 201 ? null : response.json() }).toEqual({
      status: 201,
      body: null,
    });

    return response.json() as FeatureBody;
  };

  const createSystem = (payload: Record<string, unknown> = {}) =>
    createOk(
      { rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset], ...payload },
      ADMIN,
      systemUrl,
    );

  const itemUrl = (feature: FeatureBody) =>
    feature.campaignId ? `${campaignUrl(feature.campaignId)}/${feature.id}` : `${systemUrl}/${feature.id}`;

  const update = (feature: FeatureBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "PATCH",
      url: itemUrl(feature),
      payload: {
        expectedVersion: feature.version,
        expectedAssetVersion: feature.assetVersion,
        ...payload,
      },
    });

  const remove = (feature: FeatureBody, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "DELETE",
      url: `${itemUrl(feature)}?expectedAssetVersion=${feature.assetVersion}`,
    });

  const get = (url: string, as: TestActor = GM) => session.injectAs(as, { method: "GET", url });

  const resolve = (feature: FeatureBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    session.injectAs(as, {
      method: "POST",
      url: `${catalogUrl()}/${feature.id}/resolve`,
      payload,
    });

  const release = async (feature: FeatureBody, releasedToPlayers = true) => {
    const response = await update(feature, { releasedToPlayers });

    expect(response.statusCode).toBe(200);

    return response.json() as FeatureBody;
  };

  const featureCount = async () => (await db.select().from(features)).length;
  const featureAssetCount = async () =>
    (await db.select().from(assets).where(eq(assets.assetType, "FEATURE"))).length;

  beforeEach(async () => {
    inUseAssetIds.clear();
    session = buildTestApp({ modules: [...defaultAppModules, inUseModule] });

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "FEATURES_2024", editionYear: 2024 },
        { id: ID.otherRuleset, code: "FEATURES_2014", editionYear: 2014 },
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
      assetType: "FEAT",
    } as const;

    await db.insert(assets).values([
      { ...own, id: ID.feat, title: "Alert", slug: "alert" },
      { ...own, id: ID.hiddenFeat, title: "Secret", slug: "secret" },
      { ...own, id: ID.archivedFeat, title: "Old", slug: "old", status: "ARCHIVED" },
      {
        ...own,
        campaignId: ID.foreignCampaign,
        id: ID.foreignFeat,
        title: "Foreign",
        slug: "foreign",
      },
      {
        id: ID.systemFeat,
        title: "Tough",
        slug: "tough",
        scope: "SYSTEM",
        origin: "DEFAULT",
        campaignId: null,
        status: "ACTIVE",
        assetType: "FEAT",
      },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("custom features", () => {
    it("creates asset and feature in one go, derives the code and renders the text harmless", async () => {
      const feature = await createOk(KI);

      expect(feature).toMatchObject({
        view: "GM",
        scope: "CAMPAIGN",
        campaignId: ID.campaign,
        name: "Ki",
        code: "ki",
        status: "ACTIVE",
        featureType: "RESOURCE",
        stackingMode: "NONE",
        rulesetPolicy: "NEUTRAL",
      });
      expect(feature.description).toBe(KI.description);
      expect(feature.descriptionHtml).toContain("<strong>ki</strong>");
      expect(feature.descriptionHtml).not.toContain("<script>");
      expect(feature.id).not.toBe(feature.assetId);

      const [asset] = await db.select().from(assets).where(eq(assets.id, feature.assetId));

      expect(asset).toMatchObject({ assetType: "FEATURE", scope: "CAMPAIGN", origin: "CUSTOM" });
    });

    it("lets GMs, editors and admins write, refuses players and hides the campaign from others", async () => {
      await createOk({ code: "by-editor" }, EDITOR);
      await createOk({ code: "by-admin" }, ADMIN);

      expect((await create({ name: "X", featureType: "RULE" }, PLAYER)).statusCode).toBe(403);
      expect((await create({ name: "X", featureType: "RULE" }, OUTSIDER)).statusCode).toBe(404);
      expect(
        (await create({ name: "X", featureType: "RULE" }, FOREIGN_GM)).statusCode,
      ).toBe(404);
    });

    it("refuses invalid definitions and fields the client may not set", async () => {
      const base = { name: "Rage", featureType: "ACTIVE" };

      for (const payload of [
        { ...base, featureType: "MAGIC" },
        { ...base, code: "Not A Code" },
        { ...base, campaignId: ID.foreignCampaign },
        { ...base, scope: "SYSTEM" },
        { ...base, rulesetIds: [ID.ruleset] },
        {
          ...base,
          effects: [
            { key: "e", displayOrder: 0, payload: { type: "MODIFIER", stat: "ac", amount: variable("hp") } },
          ],
        },
      ]) {
        const response = await create(payload);

        expect({ keys: Object.keys(payload), status: response.statusCode }).toEqual({
          keys: Object.keys(payload),
          status: 400,
        });
      }

      expect(await featureCount()).toBe(0);
    });

    it("keeps codes unique per campaign and rolls the asset back", async () => {
      await createOk({ code: "rage" });

      const response = await create({ name: "Rage again", featureType: "ACTIVE", code: "rage" });

      expect(response.statusCode).toBe(409);
      expect(await featureAssetCount()).toBe(1);

      await createOk({ code: "rage" }, FOREIGN_GM, campaignUrl(ID.foreignCampaign));
    });

    it("hides features of other campaigns", async () => {
      const foreign = await createOk({}, FOREIGN_GM, campaignUrl(ID.foreignCampaign));

      expect((await get(`${campaignUrl()}/${foreign.id}`)).statusCode).toBe(404);
      expect((await get(`${catalogUrl()}/${foreign.id}`)).statusCode).toBe(404);
      expect(
        (
          await session.injectAs(GM, {
            method: "PATCH",
            url: `${campaignUrl()}/${foreign.id}`,
            payload: { expectedVersion: 1, expectedAssetVersion: 1, description: "Mine" },
          })
        ).statusCode,
      ).toBe(404);
    });

    it("updates the graph atomically and refuses mixing two versions of it", async () => {
      const feature = await createOk(KI);
      const first = await update(feature, { effects: [] }, EDITOR);

      expect(first.statusCode).toBe(200);
      expect((first.json() as FeatureBody).effects).toEqual([]);

      // Another rule part from the old version is a conflict, a text field is merged.
      expect((await update(feature, { stackingMode: "STACK", parameters: [] })).statusCode).toBe(412);

      const merged = await update(feature, { description: "New text", name: "Ki points" });

      expect(merged.statusCode).toBe(200);
      expect(merged.json()).toMatchObject({ description: "New text", name: "Ki points", effects: [] });
    });

    it("checks the merged graph, so a part cannot refer to one that is gone", async () => {
      const feature = await createOk(KI);
      const response = await update(feature, { resources: [] });

      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(response.json())).toContain("Unknown resource");
    });

    it("archives and restores, hiding archived features from the default list", async () => {
      const feature = await createOk();
      const archived = await remove(feature);

      expect(archived.statusCode).toBe(200);
      expect(archived.json()).toMatchObject({ status: "ARCHIVED" });
      expect((await get(campaignUrl())).json().data).toHaveLength(0);
      expect((await get(`${campaignUrl()}?status=ARCHIVED`)).json().data).toHaveLength(1);
      expect(
        (await update(archived.json() as FeatureBody, { description: "x" })).statusCode,
      ).toBe(409);

      const restored = await session.injectAs(EDITOR, {
        method: "POST",
        url: `${itemUrl(feature)}/restore`,
        payload: { expectedAssetVersion: (archived.json() as FeatureBody).assetVersion },
      });

      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({ status: "ACTIVE" });
      expect(await featureCount()).toBe(1);
    });
    it("keeps archived features the campaign still uses in the catalog only", async () => {
      const feature = await release(await createOk());

      expect((await remove(feature)).statusCode).toBe(200);
      expect((await get(`${catalogUrl()}/${feature.id}`)).statusCode).toBe(404);
      expect((await get(`${campaignUrl()}/${feature.id}`)).statusCode).toBe(200);

      inUseAssetIds.add(feature.assetId);

      for (const as of [GM, PLAYER]) {
        expect((await get(`${catalogUrl()}/${feature.id}`, as)).statusCode).toBe(200);
        expect((await get(catalogUrl(), as)).json().data).toEqual([
          expect.objectContaining({ id: feature.id }),
        ]);
      }
    });

    it("checks references again when an archived feature comes back", async () => {
      const base = await createOk({ code: "base" });
      const improved = await createOk({
        code: "improved",
        supersedes: [{ targetAssetId: base.assetId, mode: "UPGRADE" }],
      });
      const archived = (await remove(improved)).json() as FeatureBody;

      expect((await remove(base)).statusCode).toBe(200);

      const restored = await session.injectAs(GM, {
        method: "POST",
        url: `${itemUrl(improved)}/restore`,
        payload: { expectedAssetVersion: archived.assetVersion },
      });

      expect(restored.statusCode).toBe(409);
    });
  });

  describe("references", () => {
    const option = (linkedAssetId: string) => ({
      choices: [
        {
          key: "pick",
          choiceType: "ASSET",
          minimumSelections: 1,
          maximumSelections: 1,
          displayOrder: 0,
          options: [{ code: "one", label: "One", linkedAssetId }],
        },
      ],
    });

    it("refuses missing, foreign, archived and incompatible targets without leaving rows", async () => {
      expect((await create({ name: "A", featureType: "RULE", ...option(ID.unknown) })).statusCode).toBe(404);
      expect((await create({ name: "A", featureType: "RULE", ...option(ID.foreignFeat) })).statusCode).toBe(404);
      expect((await create({ name: "A", featureType: "RULE", ...option(ID.archivedFeat) })).statusCode).toBe(409);
      expect(
        (
          await create({
            name: "A",
            featureType: "RULE",
            supersedes: [{ targetAssetId: ID.feat, mode: "REPLACE" }],
          })
        ).statusCode,
      ).toBe(409);
      expect(await featureAssetCount()).toBe(0);
    });

    it("refuses cycles, also when they would close later", async () => {
      const base = await createOk({ code: "base" });
      const improved = await createOk({
        code: "improved",
        supersedes: [{ targetAssetId: base.assetId, mode: "UPGRADE" }],
      });
      const response = await update(base, {
        supersedes: [{ targetAssetId: improved.assetId, mode: "REPLACE" }],
      });

      expect(response.statusCode).toBe(409);
      expect(JSON.stringify(response.json())).toContain("cycle");
    });

    it("keeps referenced assets from being archived and lists the usage", async () => {
      const base = await createOk({ code: "base" });
      const improved = await createOk({
        code: "improved",
        supersedes: [{ targetAssetId: base.assetId, mode: "UPGRADE" }],
        ...option(ID.feat),
      });

      const blocked = await remove(base);

      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().error.details.blockingUsages).toEqual([
        expect.objectContaining({
          id: improved.id,
          type: "FEATURE_SUPERSEDES",
          editRoute: `/campaigns/${ID.campaign}/features/${improved.id}`,
        }),
      ]);

      const usages = await get(`${campaignUrl()}/${base.id}/usages`);

      expect(usages.statusCode).toBe(200);
      expect(usages.json().typedUsages).toEqual([
        expect.objectContaining({ id: improved.id, assetId: improved.assetId }),
      ]);

      expect((await remove(improved)).statusCode).toBe(200);
      expect((await remove(base)).statusCode).toBe(200);
    });

    it("checks references again when the history brings an old definition back", async () => {
      const base = await createOk({ code: "base" });
      const improved = await createOk({
        code: "improved",
        supersedes: [{ targetAssetId: base.assetId, mode: "UPGRADE" }],
      });
      const cleared = await update(improved, { supersedes: [] });

      expect(cleared.statusCode).toBe(200);
      expect((await remove(base)).statusCode).toBe(200);

      const history = await get(`/api/v1/history/feature/${improved.id}?field=supersedes`);
      const change = (history.json().data as { eventId: string; value: unknown }[]).find(
        (item) => Array.isArray(item.value) && item.value.length === 0,
      );
      const revert = await session.injectAs(GM, {
        method: "POST",
        url: `/api/v1/history/events/${change?.eventId}/revert`,
        payload: {},
      });

      expect(revert.statusCode).toBe(409);
    });
  });

  describe("global features and the catalog", () => {
    it("lets only administrators write global features", async () => {
      const response = await create(
        { name: "Rage", featureType: "ACTIVE", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] },
        GM,
        systemUrl,
      );

      expect(response.statusCode).toBe(403);

      const feature = await createSystem();

      expect(feature).toMatchObject({ scope: "SYSTEM", campaignId: null, rulesetIds: [ID.ruleset] });
      expect((await update(feature, { description: "x" }, GM)).statusCode).toBe(403);
      expect((await remove(feature, GM)).statusCode).toBe(403);
      expect((await update(feature, { description: "x" }, ADMIN)).statusCode).toBe(200);
      // Global features are not reachable as custom features of a campaign.
      expect((await get(`${campaignUrl()}/${feature.id}`)).statusCode).toBe(404);
    });

    it("lets global features only refer to global content valid for their rulesets", async () => {
      const option = (linkedAssetId: string) => ({
        choices: [
          {
            key: "pick",
            choiceType: "ASSET",
            minimumSelections: 1,
            maximumSelections: 1,
            displayOrder: 0,
            options: [{ code: "one", label: "One", linkedAssetId }],
          },
        ],
      });

      expect(
        (
          await create(
            { name: "A", featureType: "RULE", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset], ...option(ID.feat) },
            ADMIN,
            systemUrl,
          )
        ).statusCode,
      ).toBe(404);

      await db.update(assets).set({ rulesetPolicy: "RESTRICTED" }).where(eq(assets.id, ID.systemFeat));
      await db.insert(assetRulesets).values({ assetId: ID.systemFeat, rulesetId: ID.otherRuleset });

      expect(
        (
          await create(
            { name: "A", featureType: "RULE", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset], ...option(ID.systemFeat) },
            ADMIN,
            systemUrl,
          )
        ).statusCode,
      ).toBe(409);

      await createSystem({ code: "fits", rulesetIds: [ID.otherRuleset], ...option(ID.systemFeat) });
    });

    it("offers global features for the campaign ruleset next to the campaign's own", async () => {
      const current = await createSystem({ code: "rage-2024", name: "Rage 2024" });
      const old = await createSystem({ code: "rage-2014", name: "Rage 2014", rulesetIds: [ID.otherRuleset] });
      const neutral = await createSystem({ code: "lucky", rulesetPolicy: "NEUTRAL", rulesetIds: undefined });
      const draft = await createSystem({ code: "draft", status: "DRAFT" });
      const own = await createOk({ code: "own" });

      const catalog = await get(catalogUrl());

      expect(catalog.statusCode).toBe(200);
      expect((catalog.json().data as FeatureBody[]).map((item) => item.code)).toEqual([
        "lucky",
        "own",
        "rage-2024",
      ]);
      expect((await get(`${catalogUrl()}?scope=CAMPAIGN`)).json().data).toHaveLength(1);
      expect((await get(`${catalogUrl()}/${current.id}`)).statusCode).toBe(200);
      expect((await get(`${catalogUrl()}/${old.id}`)).statusCode).toBe(404);
      expect((await get(`${catalogUrl()}/${draft.id}`)).statusCode).toBe(404);
      expect((await get(`${catalogUrl()}/${neutral.id}`)).statusCode).toBe(200);
      expect((await get(`${catalogUrl()}/${own.id}`)).statusCode).toBe(200);

      const forUsers = await get(systemUrl, PLAYER);

      expect((forUsers.json().data as FeatureBody[]).map((item) => item.code)).toEqual([
        "lucky",
        "rage-2014",
        "rage-2024",
      ]);
      expect((forUsers.json().data as FeatureBody[])[0]?.view).toBe("PLAYER");
      expect((await get(`${systemUrl}?status=DRAFT`, ADMIN)).json().data).toHaveLength(1);
      expect((await get(`${systemUrl}?rulesetId=${ID.otherRuleset}`, ADMIN)).json().data).toHaveLength(2);
      expect((await get(`${systemUrl}/${draft.id}`, PLAYER)).statusCode).toBe(404);
      expect((await get(`${systemUrl}/${draft.id}`, ADMIN)).json().view).toBe("GM");
    });

    it("validates stored definitions against changes elsewhere", async () => {
      const target = await createSystem({ code: "target" });
      const feature = await createSystem({
        code: "source",
        supersedes: [{ targetAssetId: target.assetId, mode: "REPLACE" }],
      });
      const url = `${systemUrl}/${feature.id}/validate`;

      expect((await session.injectAs(ADMIN, { method: "POST", url })).json()).toEqual({
        featureId: feature.id,
        valid: true,
        issues: [],
      });
      expect((await session.injectAs(GM, { method: "POST", url })).statusCode).toBe(403);

      // The target moves to another ruleset without the history, e.g. through an import.
      await db
        .update(assetRulesets)
        .set({ rulesetId: ID.otherRuleset })
        .where(eq(assetRulesets.assetId, target.assetId));

      const result = (await session.injectAs(ADMIN, { method: "POST", url })).json();

      expect(result).toMatchObject({
        valid: false,
        issues: [
          {
            path: ["supersedes", 0, "targetAssetId"],
            message: "The asset is not available for the rulesets of the feature",
          },
        ],
      });
    });
  });

  describe("players", () => {
    it("only see released custom features, in the player view without hidden references", async () => {
      const feature = await createOk({
        choices: [
          {
            key: "pick",
            choiceType: "ASSET",
            minimumSelections: 1,
            maximumSelections: 1,
            displayOrder: 0,
            options: [
              { code: "hidden", label: "Hidden", linkedAssetId: ID.hiddenFeat },
              { code: "global", label: "Global", linkedAssetId: ID.systemFeat },
            ],
          },
        ],
      });

      expect((await get(`${campaignUrl()}/${feature.id}`, PLAYER)).statusCode).toBe(404);
      expect((await get(campaignUrl(), PLAYER)).json().data).toHaveLength(0);

      const released = await release(feature);

      expect(released).toMatchObject({ releasedToPlayers: true });

      const view = await get(`${campaignUrl()}/${feature.id}`, PLAYER);

      expect(view.statusCode).toBe(200);
      expect(view.json()).not.toHaveProperty("version");
      expect(view.json()).not.toHaveProperty("releasedToPlayers");
      // The hidden option is left out with its label, not only its link.
      expect((view.json() as FeatureBody).choices[0]?.options).toEqual([
        expect.objectContaining({ code: "global", linkedAssetId: ID.systemFeat }),
      ]);
      expect((await get(catalogUrl(), PLAYER)).json().data).toEqual([
        expect.objectContaining({ id: feature.id, view: "PLAYER" }),
      ]);
      expect((await create({ name: "X", featureType: "RULE" }, PLAYER)).statusCode).toBe(403);
      expect((await update(released, { description: "Mine" }, PLAYER)).statusCode).toBe(403);
      expect(
        (await session.injectAs(PLAYER, { method: "POST", url: `${campaignUrl()}/${feature.id}/validate` }))
          .statusCode,
      ).toBe(403);

      // Withdrawing the release and drafts hide the feature again.
      const withdrawn = await release(released, false);

      expect((await get(`${campaignUrl()}/${feature.id}`, PLAYER)).statusCode).toBe(404);

      const draft = await update(await release(withdrawn), { status: "DRAFT" });

      expect(draft.statusCode).toBe(200);
      expect((await get(`${campaignUrl()}/${feature.id}`, PLAYER)).statusCode).toBe(404);
    });

    it("see global features always and cannot get them released or shared", async () => {
      const global = await createSystem();

      expect((await get(`${catalogUrl()}/${global.id}`, PLAYER)).json()).toMatchObject({
        view: "PLAYER",
        id: global.id,
      });
      expect((await update(global, { releasedToPlayers: true }, ADMIN)).statusCode).toBe(400);
      expect(
        (
          await create(
            { name: "X", featureType: "RULE", releasedToPlayers: true, rulesetPolicy: "NEUTRAL" },
            ADMIN,
            systemUrl,
          )
        ).statusCode,
      ).toBe(400);

      const custom = await createOk({ releasedToPlayers: true });

      expect((await get(`${campaignUrl()}/${custom.id}`, PLAYER)).statusCode).toBe(200);
      expect(
        (
          await session.injectAs(GM, {
            method: "POST",
            url: `/api/v1/campaigns/${ID.campaign}/shares`,
            payload: { assetId: custom.assetId, audience: "ALL_PLAYERS" },
          })
        ).statusCode,
      ).toBeGreaterThanOrEqual(400);
    });
  });

  describe("resolving", () => {
    it("binds parameters and scaling for an actor and caches by version", async () => {
      const feature = await createOk(KI);
      const payload = { bindings: { parameters: { bonus: 10 } }, actor: { classLevel: 6 } };
      const first = await resolve(feature, payload);

      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({
        featureId: feature.id,
        resolved: true,
        rulesetId: ID.ruleset,
        version: 1,
        parameters: [{ key: "bonus", value: 10, source: "BINDING" }],
        scaling: [{ key: "points", level: 6, value: 5 }],
        resources: [{ key: "ki", maximum: 5 }],
        activations: [{ key: "flurry", costs: [{ costType: "RESOURCE", resourceKey: "ki", amount: 1 }] }],
        effects: [
          {
            key: "speed",
            applies: "TRUE",
            payload: { type: "MOVEMENT", mode: "walk", distance: 10 },
          },
        ],
      });
      expect((await resolve(feature, payload)).json()).toEqual(first.json());

      const changed = await update(feature, {
        effects: [
          {
            key: "speed",
            displayOrder: 0,
            payload: { type: "MOVEMENT", mode: "fly", distance: variable("param.bonus") },
          },
        ],
      });

      expect(changed.statusCode).toBe(200);

      const second = await resolve(feature, payload);

      expect(second.json()).toMatchObject({
        version: 2,
        effects: [{ payload: { type: "MOVEMENT", mode: "fly", distance: 10 } }],
      });
    });

    it("refuses bindings that do not fit and checks chosen assets", async () => {
      const feature = await createOk({
        parameters: [{ key: "weapon", valueType: "ASSET_REF", required: true }],
        choices: [
          {
            key: "feat",
            choiceType: "ASSET",
            minimumSelections: 1,
            maximumSelections: 1,
            displayOrder: 0,
            optionFilter: { assetTypes: ["FEAT"] },
          },
        ],
      });

      expect((await resolve(feature, { bindings: { choices: { feat: [ID.feat] } } })).statusCode).toBe(400);

      const ok = await resolve(feature, {
        bindings: { parameters: { weapon: ID.feat }, choices: { feat: [ID.systemFeat] } },
      });

      expect(ok.statusCode).toBe(200);
      expect(ok.json().choices).toEqual([
        { key: "feat", selections: [{ code: null, label: null, value: null, assetId: ID.systemFeat }] },
      ]);

      for (const chosen of [ID.foreignFeat, ID.archivedFeat, ID.unknown]) {
        expect(
          (
            await resolve(feature, {
              bindings: { parameters: { weapon: ID.feat }, choices: { feat: [chosen] } },
            })
          ).statusCode,
        ).toBe(400);
      }

      // Players may resolve what they see, but only choose what they see, even when the GM's
      // result for the same bindings is cached.
      await release(
        (await get(`${campaignUrl()}/${feature.id}`)).json() as FeatureBody,
      );
      expect(
        (
          await resolve(feature, {
            bindings: { parameters: { weapon: ID.feat }, choices: { feat: [ID.hiddenFeat] } },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await resolve(
            feature,
            { bindings: { parameters: { weapon: ID.feat }, choices: { feat: [ID.hiddenFeat] } } },
            PLAYER,
          )
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await resolve(
            feature,
            { bindings: { parameters: { weapon: ID.feat }, choices: { feat: [ID.systemFeat] } } },
            PLAYER,
          )
        ).statusCode,
      ).toBe(200);
      expect(
        (await resolve(feature, { bindings: { parameters: { weapon: ID.feat } } }, OUTSIDER)).statusCode,
      ).toBe(404);
    });
  });

  describe("database", () => {
    it("allows one active feature per asset and only valid values", async () => {
      const feature = await createOk();
      const [row] = await db.select().from(features).where(eq(features.id, feature.id));
      const copy = { ...row!, id: undefined, version: 1 };

      await expect(db.insert(features).values({ ...copy, code: "other" })).rejects.toMatchObject({
        cause: expect.objectContaining({ code: "23505" }),
      });
      await expect(
        db.insert(features).values({ ...copy, assetId: ID.feat, code: "Bad Code" }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
      await expect(
        db.insert(features).values({ ...copy, assetId: ID.feat, code: "x", effects: {} }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
      await expect(
        db.insert(features).values({ ...copy, assetId: ID.foreignFeat, code: "x" }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23503" }) });
    });
  });
});
