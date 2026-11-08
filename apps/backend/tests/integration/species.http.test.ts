import { eq, sql } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assets,
  campaignMemberships,
  campaigns,
  rulesets,
  species,
  speciesVariants,
  users,
} from "#core/db/schema";
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

type Grant = { key: string; featureAssetId: string; operation?: string; targetFeatureAssetId?: string | null };

type SpeciesBody = {
  view: string;
  id: string;
  assetId: string;
  version: number;
  assetVersion: number;
  campaignId: string | null;
  scope: string;
  status: string;
  code: string;
  name: string;
  selectable: boolean;
  rulesetIds?: string[];
  releasedToPlayers?: boolean;
  descriptionHtml: string | null;
  textSectionsHtml: { key: string; contentHtml: string }[];
  featureGrants: Grant[];
  merged?: string[];
};

type VariantBody = SpeciesBody & { speciesId: string; variantGroupCode: string; rulesetPolicy?: string };

type FeatureBody = { id: string; assetId: string; version: number; assetVersion: number };

const ELF = {
  name: "Elf",
  creatureType: "HUMANOID",
  lifespanMode: "SPECIES_SPECIFIC",
  description: "Graceful **folk** <script>alert(1)</script>",
  sizeOptions: [{ size: "MEDIUM", isDefault: true }],
  movementModes: [{ mode: "WALK", distanceFeet: 30, isBase: true }],
  ageProfile: { adulthoodAge: 100, typicalLifespan: 750 },
  textSections: [{ key: "names", title: "Names", content: "<b>Ara</b> *Galinndan*" }],
  variantGroups: [
    { code: "lineage", name: "Elven lineage", minimumSelections: 1, maximumSelections: 1, required: true },
  ],
};

const asiEffect = (ability = "dex", value = 2) => ({
  effects: [
    {
      key: "asi",
      payload: { type: "MODIFIER", stat: `ability.${ability}`, amount: { type: "CONST", value } },
      displayOrder: 0,
    },
  ],
});

describe("species", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) => `/api/v1/campaigns/${campaignId}/species`;
  const catalogUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/catalog/species`;
  const systemUrl = "/api/v1/species";

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

  const createOk = (payload: Record<string, unknown> = {}, as: TestActor = GM, url = campaignUrl()) =>
    inject(as, "POST", url, { ...ELF, ...payload }).then((response) => expectStatus<SpeciesBody>(response, 201));

  const createSystem = (payload: Record<string, unknown> = {}, rulesetIds: string[] = [ID.ruleset]) =>
    createOk({ rulesetPolicy: "RESTRICTED", rulesetIds, ...payload }, ADMIN, systemUrl);

  const itemUrl = (item: { id: string; campaignId: string | null }) =>
    item.campaignId ? `${campaignUrl(item.campaignId)}/${item.id}` : `${systemUrl}/${item.id}`;

  const variantsUrl = (item: { id: string; campaignId: string | null }) => `${itemUrl(item)}/variants`;

  const variantUrl = (variant: VariantBody) =>
    `${itemUrl({ id: variant.speciesId, campaignId: variant.campaignId })}/variants/${variant.id}`;

  const update = (url: string, item: { version: number; assetVersion: number }, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", url, { expectedVersion: item.version, expectedAssetVersion: item.assetVersion, ...payload });

  const remove = (url: string, item: { assetVersion: number }, as: TestActor = GM) =>
    inject(as, "DELETE", `${url}?expectedAssetVersion=${item.assetVersion}`);

  const restore = (url: string, item: { assetVersion: number }, as: TestActor = GM) =>
    inject(as, "POST", `${url}/restore`, { expectedAssetVersion: item.assetVersion });

  const createVariant = (item: SpeciesBody, payload: Record<string, unknown> = {}, as: TestActor = GM) =>
    inject(as, "POST", variantsUrl(item), { name: "Drow", variantGroupCode: "lineage", ...payload });

  const createVariantOk = async (item: SpeciesBody, payload: Record<string, unknown> = {}, as: TestActor = GM) =>
    expectStatus<VariantBody>(await createVariant(item, payload, as), 201);

  const createFeature = async (
    payload: Record<string, unknown> = {},
    as: TestActor = GM,
    url = `/api/v1/campaigns/${ID.campaign}/features`,
  ) =>
    expectStatus<FeatureBody>(
      await inject(as, "POST", url, { name: "Darkvision", featureType: "PASSIVE", ...payload }),
      201,
    );

  const createSystemFeature = (rulesetIds: string[] = [ID.ruleset], payload: Record<string, unknown> = {}) =>
    createFeature({ rulesetPolicy: "RESTRICTED", rulesetIds, ...payload }, ADMIN, "/api/v1/features");

  const speciesCount = async () => (await db.select().from(species)).length;
  const speciesAssetCount = async () =>
    (await db.select().from(assets).where(eq(assets.assetType, "SPECIES"))).length;

  beforeEach(async () => {
    session = buildTestApp();

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "SPECIES_2024", editionYear: 2024 },
        { id: ID.oldRuleset, code: "SPECIES_2014", editionYear: 2014 },
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

  describe("custom species", () => {
    it("creates asset and species in one go and renders texts harmless", async () => {
      const item = await createOk();

      expect(item).toMatchObject({
        view: "FULL",
        scope: "CAMPAIGN",
        campaignId: ID.campaign,
        name: "Elf",
        code: "elf",
        status: "ACTIVE",
        selectable: true,
        releasedToPlayers: false,
      });
      expect(item.descriptionHtml).toContain("<strong>folk</strong>");
      expect(item.descriptionHtml).not.toContain("<script");
      expect(item.textSectionsHtml[0]?.contentHtml).toContain("<em>Galinndan</em>");
      expect(item.textSectionsHtml[0]?.contentHtml).not.toContain("<b>");
      expect((await expectStatus<SpeciesBody>(await inject(GM, "GET", itemUrl(item)), 200)).id).toBe(item.id);
    });

    it("lets GMs, editors and admins write, refuses players and hides the campaign from others", async () => {
      await createOk({ code: "by-gm" });
      await createOk({ code: "by-editor" }, EDITOR);
      await createOk({ code: "by-admin" }, ADMIN);

      expect((await inject(PLAYER, "POST", campaignUrl(), ELF)).statusCode).toBe(403);
      expect((await inject(OUTSIDER, "POST", campaignUrl(), ELF)).statusCode).toBe(404);
      expect((await inject(FOREIGN_GM, "POST", campaignUrl(), ELF)).statusCode).toBe(404);
      expect((await inject(OUTSIDER, "GET", campaignUrl())).statusCode).toBe(404);
    });

    it("refuses invalid definitions and fields the client may not set", async () => {
      const twoBases = await inject(GM, "POST", campaignUrl(), {
        ...ELF,
        movementModes: [
          { mode: "WALK", distanceFeet: 30, isBase: true },
          { mode: "WALK", distanceFeet: 25, isBase: true },
        ],
      });
      const noLifespan = await inject(GM, "POST", campaignUrl(), { ...ELF, ageProfile: null });

      expect(twoBases.statusCode).toBe(400);
      expect(noLifespan.statusCode).toBe(400);
      expect((await inject(GM, "POST", campaignUrl(), { ...ELF, campaignId: ID.foreignCampaign })).statusCode).toBe(400);
      expect((await inject(GM, "POST", campaignUrl(), { ...ELF, scope: "SYSTEM" })).statusCode).toBe(400);
      expect((await inject(GM, "POST", campaignUrl(), { ...ELF, rulesetIds: [ID.oldRuleset] })).statusCode).toBe(400);
      expect(await speciesCount()).toBe(0);
    });

    it("keeps codes unique per campaign and rolls the asset back", async () => {
      await createOk();

      expect((await inject(GM, "POST", campaignUrl(), ELF)).statusCode).toBe(409);
      expect(await speciesCount()).toBe(1);
      expect(await speciesAssetCount()).toBe(1);
      await createOk({}, FOREIGN_GM, campaignUrl(ID.foreignCampaign));
    });

    it("hides species of other campaigns", async () => {
      const foreign = await createOk({}, FOREIGN_GM, campaignUrl(ID.foreignCampaign));

      expect((await inject(GM, "GET", `${campaignUrl()}/${foreign.id}`)).statusCode).toBe(404);
      expect((await inject(GM, "GET", `${catalogUrl()}/${foreign.id}`)).statusCode).toBe(404);
      expect(
        (await update(`${campaignUrl()}/${foreign.id}`, foreign, { creatureType: "FEY" })).statusCode,
      ).toBe(404);
    });

    it("updates with versions and refuses a stale version", async () => {
      const item = await createOk();
      const updated = await expectStatus<SpeciesBody>(
        await update(itemUrl(item), item, { name: "High Folk", creatureType: "FEY" }),
        200,
      );

      expect(updated).toMatchObject({ name: "High Folk", merged: [] });
      expect(updated.assetVersion).toBe(item.assetVersion + 1);
      // Conflicts are per field: an old version may change what nobody changed since.
      expect((await update(itemUrl(item), item, { creatureType: "GIANT" })).statusCode).toBe(412);
      expect((await update(itemUrl(item), item, { name: "Old" })).statusCode).toBe(412);
      expect((await update(itemUrl(item), item, { description: "Untouched since" })).statusCode).toBe(200);
    });

    it("archives softly and restores; archived species cannot change and leave the catalog", async () => {
      const item = await createOk();
      const archived = await expectStatus<SpeciesBody>(await remove(itemUrl(item), item), 200);

      expect(archived).toMatchObject({ status: "ARCHIVED", selectable: false });
      expect((await db.select().from(species).where(eq(species.id, item.id)))[0]?.deletedAt).toBeNull();
      expect((await update(itemUrl(item), archived, { creatureType: "FEY" })).statusCode).toBe(409);
      expect((await inject(GM, "GET", `${catalogUrl()}/${item.id}`)).statusCode).toBe(404);
      expect((await inject(GM, "GET", itemUrl(item))).statusCode).toBe(200);

      const restored = await expectStatus<SpeciesBody>(await restore(itemUrl(item), archived), 200);

      expect(restored.status).toBe("ACTIVE");
    });

    it("rolls back the whole action when a later step fails", async () => {
      const response = await inject(GM, "POST", campaignUrl(), {
        ...ELF,
        featureGrants: [{ key: "darkvision", featureAssetId: ID.unknown }],
      });

      expect(response.statusCode).toBe(404);
      expect(await speciesCount()).toBe(0);
      expect(await speciesAssetCount()).toBe(0);
    });
  });

  describe("variants", () => {
    it("creates variants in the scope of their species and lists them", async () => {
      const item = await createOk();
      const drow = await createVariantOk(item, { description: "Of the *Underdark*" });

      expect(drow).toMatchObject({
        view: "FULL",
        speciesId: item.id,
        campaignId: ID.campaign,
        scope: "CAMPAIGN",
        code: "drow",
        variantGroupCode: "lineage",
      });
      expect(drow.descriptionHtml).toContain("<em>Underdark</em>");

      const list = await expectStatus<{ data: VariantBody[] }>(await inject(GM, "GET", variantsUrl(item)), 200);

      expect(list.data.map((variant) => variant.code)).toEqual(["drow"]);
      expect((await inject(GM, "GET", variantUrl(drow))).statusCode).toBe(200);
      expect((await createVariant(item, { name: "Drow" })).statusCode).toBe(409);
      expect((await createVariant(item, { name: "Elf", variantGroupCode: "legacy" })).statusCode).toBe(409);
      expect((await createVariant(item, { name: "Elf" }, PLAYER)).statusCode).toBe(403);
    });

    it("keeps the species from being archived while it has variants, and variants from coming back without it", async () => {
      const item = await createOk();
      const drow = await createVariantOk(item);

      expect((await remove(itemUrl(item), item)).statusCode).toBe(409);

      const archivedDrow = await expectStatus<VariantBody>(await remove(variantUrl(drow), drow), 200);
      const archived = await expectStatus<SpeciesBody>(await remove(itemUrl(item), item), 200);

      expect((await restore(variantUrl(drow), archivedDrow)).statusCode).toBe(409);
      expect((await createVariant(item, { name: "Wood Elf" })).statusCode).toBe(409);

      await expectStatus(await restore(itemUrl(item), archived), 200);
      await expectStatus(await restore(variantUrl(drow), archivedDrow), 200);
    });

    it("refuses to remove a group or a granted feature that variants still need", async () => {
      const darkvision = await createFeature();
      const superior = await createFeature({ name: "Superior Darkvision" });
      const item = await createOk({ featureGrants: [{ key: "darkvision", featureAssetId: darkvision.assetId }] });
      const replacement = {
        key: "superior",
        featureAssetId: superior.assetId,
        operation: "REPLACE",
        targetFeatureAssetId: darkvision.assetId,
      };
      const drow = await createVariantOk(item, { featureGrants: [replacement] });

      expect((await update(itemUrl(item), item, { variantGroups: [] })).statusCode).toBe(409);
      expect((await update(itemUrl(item), item, { featureGrants: [] })).statusCode).toBe(409);
      expect(
        (await update(variantUrl(drow), drow, { featureGrants: [{ ...replacement, targetFeatureAssetId: ID.unknown }] }))
          .statusCode,
      ).toBe(409);
      expect((await update(variantUrl(drow), drow, { variantGroupCode: "legacy" })).statusCode).toBe(409);
    });

    it("keeps grant keys unique across all variants of a species", async () => {
      const magic = await createFeature({ name: "Drow Magic" });
      const cantrip = await createFeature({ name: "Cantrip" });
      const item = await createOk();
      const drow = await createVariantOk(item, { featureGrants: [{ key: "spells", featureAssetId: magic.assetId }] });
      const clash = await createVariant(item, {
        name: "High Elf",
        featureGrants: [{ key: "spells", featureAssetId: cantrip.assetId }],
      });

      expect(clash.statusCode).toBe(409);
      expect(JSON.stringify(clash.json())).toContain("already used by variant 'drow'");

      const high = await createVariantOk(item, {
        name: "High Elf",
        featureGrants: [{ key: "cantrip", featureAssetId: cantrip.assetId }],
      });

      expect(
        (await update(variantUrl(high), high, { featureGrants: [{ key: "spells", featureAssetId: cantrip.assetId }] }))
          .statusCode,
      ).toBe(409);
      expect(drow.id).toBeDefined();
    });

    it("checks a new variant against the species as it is after a concurrent change", async () => {
      const item = await createOk({
        variantGroups: [
          ...ELF.variantGroups,
          { code: "legacy", name: "Legacy", minimumSelections: 0, maximumSelections: 1, required: false },
        ],
      });
      const client = await pool.connect();

      try {
        // Another writer of the species holds its row and removes the group meanwhile.
        await client.query("begin");
        await client.query("select id from species where id = $1 for update", [item.id]);

        const pending = createVariant(item, { name: "Pale", variantGroupCode: "legacy" });

        await new Promise((resolve) => setTimeout(resolve, 300));
        await client.query("update species set variant_groups = $1 where id = $2", [
          JSON.stringify(ELF.variantGroups),
          item.id,
        ]);
        await client.query("commit");

        const created = await pending;

        expect(created.statusCode).toBe(409);
        expect(JSON.stringify(created.json())).toContain("no variant group 'legacy'");
      } finally {
        client.release();
      }
    });

    it("leaves a variant whose stored grants no longer parse out of every read of its species", async () => {
      const item = await createOk();
      const drow = await createVariantOk(item);
      const broken = await createVariantOk(item, { name: "High Elf" });

      await db
        .update(speciesVariants)
        .set({ featureGrants: [{ bogus: true }] })
        .where(eq(speciesVariants.id, broken.id));

      const codes = async (url: string) =>
        (await expectStatus<{ data: { code: string }[] }>(await inject(GM, "GET", url), 200)).data.map(
          (variant) => variant.code,
        );

      expect(await codes(variantsUrl(item))).toEqual(["drow"]);
      await expectStatus(await inject(GM, "GET", `${catalogUrl()}/${item.id}/features`), 200);
      await expectStatus(await inject(GM, "GET", `${catalogUrl()}/${item.id}/creation-options`), 200);
      await expectStatus(
        await inject(GM, "POST", `${catalogUrl()}/${item.id}/resolve`, { variantAssetIds: [drow.assetId] }),
        200,
      );

      const result = await expectStatus<{ valid: boolean; issues: { path: unknown[] }[] }>(
        await inject(GM, "POST", `${itemUrl(item)}/validate`),
        200,
      );

      expect(result.valid).toBe(false);
      expect(result.issues).toEqual([expect.objectContaining({ path: ["variants", "high-elf"] })]);
    });

    it("lets global variants only cover rulesets of their species", async () => {
      const item = await createSystem();
      const inherited = await createVariantOk(item, {}, ADMIN);

      expect(inherited).toMatchObject({ scope: "SYSTEM", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] });
      expect(
        (await createVariant(item, { name: "Sea Elf", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.oldRuleset] }, ADMIN))
          .statusCode,
      ).toBe(409);
      expect((await createVariant(item, { name: "Sea Elf", rulesetPolicy: "NEUTRAL" }, ADMIN)).statusCode).toBe(409);
    });
  });

  describe("rules", () => {
    it("refuses ability score increases for 2024 rulesets and allows them for 2014", async () => {
      const asi = await createFeature({ name: "Ability Score Increase", ...asiEffect() });
      const oldAsi = await createFeature(
        { name: "Ability Score Increase", ...asiEffect() },
        GM,
        `/api/v1/campaigns/${ID.oldCampaign}/features`,
      );
      const grant = (featureAssetId: string) => ({ featureGrants: [{ key: "asi", featureAssetId }] });

      const modern = await inject(GM, "POST", campaignUrl(), { ...ELF, ...grant(asi.assetId) });

      expect(modern.statusCode).toBe(409);
      expect(JSON.stringify(modern.json())).toContain("ability score increases");
      await createOk(grant(oldAsi.assetId), GM, campaignUrl(ID.oldCampaign));

      const systemOld = await createSystemFeature([ID.oldRuleset], { name: "ASI", ...asiEffect() });

      await createSystem(grant(systemOld.assetId), [ID.oldRuleset]);
      expect(
        (await inject(ADMIN, "POST", systemUrl, { ...ELF, code: "neutral-elf", ...grant(systemOld.assetId) }))
          .statusCode,
      ).toBe(409);
    });

    it("applies the ability rule to variants as well", async () => {
      const asi = await createFeature({ name: "ASI", ...asiEffect("int", 1) });
      const item = await createOk();

      expect((await createVariant(item, { featureGrants: [{ key: "asi", featureAssetId: asi.assetId }] })).statusCode).toBe(409);
    });

    it("counts BASE_VALUE and stats in other case as ability score increases", async () => {
      const baseValue = await createFeature({
        name: "Giant Strength",
        effects: [
          {
            key: "str",
            payload: { type: "BASE_VALUE", stat: "ability.STR", value: { type: "CONST", value: 19 } },
            displayOrder: 0,
          },
        ],
      });

      expect(
        (await inject(GM, "POST", campaignUrl(), { ...ELF, featureGrants: [{ key: "str", featureAssetId: baseValue.assetId }] }))
          .statusCode,
      ).toBe(409);
    });

    it("keeps features granted by 2024 species from starting to raise ability scores, also through undo", async () => {
      const featureUrl = (feature: FeatureBody) => `/api/v1/campaigns/${ID.campaign}/features/${feature.id}`;
      const plain = await createFeature();

      await createOk({ featureGrants: [{ key: "darkvision", featureAssetId: plain.assetId }] });

      const patched = await update(featureUrl(plain), plain, asiEffect());

      expect(patched.statusCode).toBe(409);
      expect(JSON.stringify(patched.json())).toContain("forbids that this asset raises ability scores");

      // A feature that raised ability scores before it was granted cannot get them back by undo.
      const asi = await createFeature({ name: "Former ASI", ...asiEffect() });
      const cleared = await expectStatus<FeatureBody>(await update(featureUrl(asi), asi, { effects: [] }), 200);

      expect(cleared.version).toBeGreaterThan(asi.version);
      await createOk({ name: "Wood Elf", featureGrants: [{ key: "former", featureAssetId: asi.assetId }] });

      const history = await expectStatus<{ data: { eventId: string; field: string }[] }>(
        await inject(GM, "GET", `/api/v1/history/feature/${asi.id}?field=effects`),
        200,
      );
      const clearing = history.data[0];

      expect(clearing).toBeDefined();
      expect((await inject(GM, "POST", `/api/v1/history/events/${clearing?.eventId}/revert`, {})).statusCode).toBe(409);
    });

    it("refuses features of other rulesets, other campaigns and other types", async () => {
      const oldFeature = await createSystemFeature([ID.oldRuleset]);
      const foreign = await createFeature({}, FOREIGN_GM, `/api/v1/campaigns/${ID.foreignCampaign}/features`);
      const grant = (featureAssetId: string) => ({ featureGrants: [{ key: "darkvision", featureAssetId }] });
      const item = await createOk();

      expect((await inject(ADMIN, "POST", systemUrl, { ...ELF, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset], ...grant(oldFeature.assetId) })).statusCode).toBe(409);
      expect((await inject(GM, "POST", campaignUrl(), { ...ELF, code: "x", ...grant(oldFeature.assetId) })).statusCode).toBe(409);
      expect((await inject(GM, "POST", campaignUrl(), { ...ELF, code: "y", ...grant(foreign.assetId) })).statusCode).toBe(404);
      expect((await inject(GM, "POST", campaignUrl(), { ...ELF, code: "z", ...grant(item.assetId) })).statusCode).toBe(409);
    });

    it("checks bindings against the parameters of the granted feature", async () => {
      const feature = await createFeature({
        name: "Breath Weapon",
        parameters: [{ key: "dice", valueType: "INTEGER", required: true }],
      });
      const grant = (bindings: unknown[]) => ({
        featureGrants: [{ key: "breath", featureAssetId: feature.assetId, bindings }],
      });

      expect((await inject(GM, "POST", campaignUrl(), { ...ELF, ...grant([]) })).statusCode).toBe(409);
      expect(
        (await inject(GM, "POST", campaignUrl(), {
          ...ELF,
          ...grant([{ parameterKey: "dice", bindingSource: "STATIC", staticValue: "many" }]),
        })).statusCode,
      ).toBe(409);
      await createOk(grant([{ parameterKey: "dice", bindingSource: "CONTEXT", contextKey: "level.character" }]));
    });

    it("keeps granted features from being archived and lists species and variants as usages", async () => {
      const feature = await createFeature();
      const item = await createOk({ featureGrants: [{ key: "darkvision", featureAssetId: feature.assetId }] });
      const featureUrl = `/api/v1/campaigns/${ID.campaign}/features/${feature.id}`;

      expect((await remove(featureUrl, feature)).statusCode).toBe(409);

      await createVariantOk(item);

      const usages = await expectStatus<{ typedUsages: { type: string; label: string }[] }>(
        await inject(GM, "GET", `${itemUrl(item)}/usages`),
        200,
      );

      expect(usages.typedUsages).toEqual([
        expect.objectContaining({ type: "SPECIES_VARIANT_DEFINITION", label: "Drow" }),
      ]);
    });

    it("validates stored definitions on request", async () => {
      const item = await createOk();
      const result = await expectStatus<{ valid: boolean; issues: { message: string }[] }>(
        await inject(GM, "POST", `${itemUrl(item)}/validate`),
        200,
      );

      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => issue.message)).toEqual([
        "The group needs at least 1 active variants, it has 0",
      ]);

      const drow = await createVariantOk(item);

      expect((await expectStatus<{ valid: boolean }>(await inject(GM, "POST", `${itemUrl(item)}/validate`), 200)).valid).toBe(true);
      expect((await expectStatus<{ valid: boolean }>(await inject(GM, "POST", `${variantUrl(drow)}/validate`), 200)).valid).toBe(true);
      expect((await inject(PLAYER, "POST", `${itemUrl(item)}/validate`)).statusCode).toBe(403);
    });
  });

  describe("global species and the catalog", () => {
    it("lets only administrators write global species and keeps codes unique per ruleset", async () => {
      expect((await inject(GM, "POST", systemUrl, ELF)).statusCode).toBe(403);

      const modern = await createSystem();

      expect(modern).toMatchObject({ scope: "SYSTEM", campaignId: null, rulesetIds: [ID.ruleset] });
      await createSystem({}, [ID.oldRuleset]);
      expect((await inject(ADMIN, "POST", systemUrl, { ...ELF, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] })).statusCode).toBe(409);
      expect((await update(itemUrl(modern), modern, { creatureType: "FEY" }, GM)).statusCode).toBe(403);
    });

    it("offers active global species for the campaign ruleset next to the campaign's own", async () => {
      await createSystem({ name: "Dwarf", code: "dwarf" });
      await createSystem({ name: "Old Dwarf", code: "old-dwarf" }, [ID.oldRuleset]);
      await createSystem({ name: "Draft", code: "draft", status: "DRAFT" });
      await createOk({ name: "Sea Elf" });

      const codes = async (url: string) =>
        (await expectStatus<{ data: { code: string }[] }>(await inject(GM, "GET", url), 200)).data.map(
          (item) => item.code,
        );

      expect(await codes(catalogUrl())).toEqual(["dwarf", "sea-elf"]);
      expect(await codes(`${catalogUrl()}?scope=SYSTEM`)).toEqual(["dwarf"]);
      expect(await codes(campaignUrl())).toEqual(["sea-elf"]);
      expect(await codes(`${catalogUrl()}?size=SMALL`)).toEqual([]);
      expect(await codes(`${systemUrl}?rulesetId=${ID.oldRuleset}`)).toEqual(["old-dwarf"]);
    });
  });

  describe("selection", () => {
    const setUpElf = async () => {
      const darkvision = await createFeature({ name: "Darkvision" });
      const superior = await createFeature({ name: "Superior Darkvision" });
      const magic = await createFeature({ name: "Drow Magic" });
      const item = await createOk({
        featureGrants: [{ key: "darkvision", featureAssetId: darkvision.assetId }],
      });
      const drow = await createVariantOk(item, {
        featureGrants: [
          {
            key: "superior",
            featureAssetId: superior.assetId,
            operation: "REPLACE",
            targetFeatureAssetId: darkvision.assetId,
          },
          { key: "magic", featureAssetId: magic.assetId, minimumCharacterLevel: 3 },
        ],
      });
      const high = await createVariantOk(item, { name: "High Elf" });

      return { item, drow, high, darkvision, superior, magic };
    };

    it("offers sizes and variant groups and lists the grants with their source", async () => {
      const { item, drow, darkvision } = await setUpElf();
      const options = await expectStatus<{
        defaultSize: string;
        variantGroups: { code: string; satisfiable: boolean; variants: { code: string }[] }[];
      }>(await inject(GM, "GET", `${catalogUrl()}/${item.id}/creation-options`), 200);

      expect(options.defaultSize).toBe("MEDIUM");
      expect(options.variantGroups).toEqual([
        expect.objectContaining({ code: "lineage", satisfiable: true }),
      ]);
      expect(options.variantGroups[0]?.variants.map((variant) => variant.code)).toEqual(["drow", "high-elf"]);

      const features = await expectStatus<{ grants: { key: string; sourceAssetId: string }[] }>(
        await inject(GM, "GET", `${catalogUrl()}/${item.id}/features`),
        200,
      );

      expect(features.grants.map((grant) => [grant.key, grant.sourceAssetId])).toEqual([
        ["darkvision", item.assetId],
        ["superior", drow.assetId],
        ["magic", drow.assetId],
      ]);
      expect(darkvision.assetId).toBeDefined();
    });

    it("resolves the grants of a selection at the character level", async () => {
      const { item, drow } = await setUpElf();
      const resolve = (payload: Record<string, unknown>, as: TestActor = GM) =>
        inject(as, "POST", `${catalogUrl()}/${item.id}/resolve`, payload);
      const first = await expectStatus<{
        size: string;
        variants: { code: string }[];
        grants: { key: string; status: string; resolved: unknown }[];
      }>(await resolve({ variantAssetIds: [drow.assetId] }), 200);

      expect(first.size).toBe("MEDIUM");
      expect(first.variants.map((variant) => variant.code)).toEqual(["drow"]);
      expect(first.grants.map((grant) => [grant.key, grant.status, grant.resolved !== null])).toEqual([
        ["darkvision", "REPLACED", false],
        ["superior", "APPLIED", true],
        ["magic", "LOCKED", false],
      ]);

      const third = await expectStatus<{ grants: { key: string; status: string }[] }>(
        await resolve({ variantAssetIds: [drow.assetId], characterLevel: 3 }),
        200,
      );

      expect(third.grants.find((grant) => grant.key === "magic")?.status).toBe("APPLIED");

      const missing = await resolve({});

      expect(missing.statusCode).toBe(409);
      expect(JSON.stringify(missing.json())).toContain("needs at least 1 variants");
      expect((await resolve({ variantAssetIds: [drow.assetId], size: "SMALL" })).statusCode).toBe(409);
      expect((await resolve({ variantAssetIds: [item.assetId] })).statusCode).toBe(409);
      expect((await resolve({ variantAssetIds: [drow.assetId], size: "HUGE" })).statusCode).toBe(400);
    });

    it("adds up ability score increases of 2014 races", async () => {
      const url = `/api/v1/campaigns/${ID.oldCampaign}/features`;
      const dex = await createFeature({ name: "Dex", ...asiEffect("dex", 2) }, GM, url);
      const int = await createFeature({ name: "Int", ...asiEffect("int", 1) }, GM, url);
      const item = await createOk(
        { featureGrants: [{ key: "dex", featureAssetId: dex.assetId }] },
        GM,
        campaignUrl(ID.oldCampaign),
      );
      const high = await createVariantOk(item, {
        name: "High Elf",
        featureGrants: [{ key: "int", featureAssetId: int.assetId }],
      });
      const result = await expectStatus<{ totals: { modifiers: Record<string, number> } }>(
        await inject(GM, "POST", `${catalogUrl(ID.oldCampaign)}/${item.id}/resolve`, {
          variantAssetIds: [high.assetId],
        }),
        200,
      );

      expect(result.totals.modifiers).toEqual({ "ability.dex": 2, "ability.int": 1 });
    });

    it("refuses archived species and variants for a new selection", async () => {
      const { item, drow, high } = await setUpElf();
      const archived = await expectStatus<VariantBody>(await remove(variantUrl(high), high), 200);

      expect(archived.status).toBe("ARCHIVED");
      expect(
        (await inject(GM, "POST", `${catalogUrl()}/${item.id}/resolve`, { variantAssetIds: [high.assetId] })).statusCode,
      ).toBe(409);
      expect(
        (await inject(GM, "POST", `${catalogUrl()}/${item.id}/resolve`, { variantAssetIds: [drow.assetId] })).statusCode,
      ).toBe(200);
    });
  });

  describe("players", () => {
    it("see global species and released custom ones in the player view", async () => {
      const global = await createSystem({ name: "Dwarf", code: "dwarf" });
      const own = await createOk();

      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${own.id}`)).statusCode).toBe(404);

      const playerGlobal = await expectStatus<Record<string, unknown>>(
        await inject(PLAYER, "GET", `${catalogUrl()}/${global.id}`),
        200,
      );

      expect(playerGlobal).toMatchObject({ view: "PLAYER", code: "dwarf" });
      expect(playerGlobal).not.toHaveProperty("rulesetIds");
      expect(playerGlobal).not.toHaveProperty("releasedToPlayers");

      await expectStatus(await update(itemUrl(own), own, { releasedToPlayers: true }), 200);

      const codes = (
        await expectStatus<{ data: { code: string; view: string }[] }>(await inject(PLAYER, "GET", catalogUrl()), 200)
      ).data;

      expect(codes).toEqual([
        expect.objectContaining({ code: "dwarf", view: "PLAYER" }),
        expect.objectContaining({ code: "elf", view: "PLAYER" }),
      ]);
      expect((await inject(PLAYER, "PATCH", itemUrl(own), { expectedVersion: 1, expectedAssetVersion: 1, name: "X" })).statusCode).toBe(403);
    });

    it("see released variants only, and custom features through a released species", async () => {
      const darkvision = await createFeature();
      const item = await createOk({
        releasedToPlayers: true,
        featureGrants: [{ key: "darkvision", featureAssetId: darkvision.assetId }],
      });
      const drow = await createVariantOk(item, { releasedToPlayers: true });

      await createVariantOk(item, { name: "High Elf" });

      const variants = await expectStatus<{ data: { code: string; view: string }[] }>(
        await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}/variants`),
        200,
      );

      expect(variants.data.map((variant) => [variant.code, variant.view])).toEqual([["drow", "PLAYER"]]);

      const detail = await expectStatus<{ featureGrants: Grant[] }>(
        await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`),
        200,
      );

      expect(detail.featureGrants.map((grant) => grant.key)).toEqual(["darkvision"]);
      expect(
        (await inject(PLAYER, "GET", `/api/v1/campaigns/${ID.campaign}/catalog/features/${darkvision.id}`)).statusCode,
      ).toBe(200);
      expect(
        (await inject(PLAYER, "POST", `${catalogUrl()}/${item.id}/resolve`, { variantAssetIds: [drow.assetId] }))
          .statusCode,
      ).toBe(200);
    });
  });

  describe("second review", () => {
    it("lets players read a species whose grants bind free text", async () => {
      const breath = await createFeature({
        name: "Breath Weapon",
        parameters: [{ key: "element", valueType: "TEXT", required: true }],
      });
      const item = await createOk({
        releasedToPlayers: true,
        featureGrants: [
          {
            key: "breath",
            featureAssetId: breath.assetId,
            bindings: [{ parameterKey: "element", bindingSource: "STATIC", staticValue: "fire" }],
          },
        ],
      });

      await expectStatus(await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`), 200);
      await expectStatus(await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}/features`), 200);
    });

    it("refuses to mix concurrent changes of different definition parts", async () => {
      const item = await createOk();

      await expectStatus(await update(itemUrl(item), item, { sizeOptions: [{ size: "SMALL", isDefault: true }] }), 200);

      const stale = await update(itemUrl(item), { ...item, assetVersion: item.assetVersion }, {
        variantGroups: [
          { code: "lineage", name: "Lineage", minimumSelections: 0, maximumSelections: 1, required: false },
        ],
      });

      expect(stale.statusCode).toBe(412);
      // A change outside the definition still merges.
      await expectStatus(await update(itemUrl(item), item, { displayOrder: 5 }), 200);
    });

    it("validates without waiting for a writer of the species", async () => {
      const item = await createOk();
      const drow = await createVariantOk(item);
      const client = await pool.connect();

      try {
        await client.query("begin");
        await client.query("select id from species where id = $1 for update", [item.id]);

        const started = Date.now();

        await expectStatus(await inject(GM, "POST", `${variantUrl(drow)}/validate`), 200);
        expect(Date.now() - started).toBeLessThan(3000);
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
  });

  describe("third review", () => {
    const classScaling = (scaleBy = "CLASS_LEVEL") => ({
      scalingTracks: [
        { key: "points", valueType: "INTEGER", scaleBy, values: [{ minimumLevel: 1, value: 1 }] },
      ],
    });

    it("keeps a variant from being added while its species is being archived", async () => {
      const item = await createOk();
      const client = await pool.connect();

      try {
        // An archive of the species holds its asset and commits meanwhile.
        await client.query("begin");
        await client.query("update assets set status = 'ARCHIVED' where id = $1", [item.assetId]);

        const pending = createVariant(item);

        await new Promise((resolve) => setTimeout(resolve, 300));
        await client.query("commit");

        const created = await pending;

        expect(created.statusCode).toBe(409);
        expect(JSON.stringify(created.json())).toContain("archived");
      } finally {
        client.release();
      }
    });

    it("validates a variant with every issue at once", async () => {
      const item = await createOk();
      const drow = await createVariantOk(item);

      await db
        .update(speciesVariants)
        .set({ variantGroupCode: "legacy", featureGrants: [{ key: "x", featureAssetId: ID.unknown }] })
        .where(eq(speciesVariants.id, drow.id));

      const result = await expectStatus<{ valid: boolean; issues: { message: string }[] }>(
        await inject(GM, "POST", `${variantUrl(drow)}/validate`),
        200,
      );

      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "The species has no variant group 'legacy'",
          expect.stringMatching(/not found|does not exist/i),
        ]),
      );
    });

    it("allows ability score penalties for 2024 species", async () => {
      const penalty = await createFeature({ name: "Sunlight Weakness", ...asiEffect("str", -2) });

      await createOk({ featureGrants: [{ key: "weak", featureAssetId: penalty.assetId }] });
    });

    it("refuses features that depend on a class level, also when they change later", async () => {
      const byClass = await createFeature({ name: "Ki", ...classScaling() });
      const refused = await inject(GM, "POST", campaignUrl(), {
        ...ELF,
        featureGrants: [{ key: "ki", featureAssetId: byClass.assetId }],
      });

      expect(refused.statusCode).toBe(409);
      expect(JSON.stringify(refused.json())).toContain("class level");

      const byCharacter = await createFeature({ name: "Breath", ...classScaling("CHARACTER_LEVEL") });

      await createOk({ featureGrants: [{ key: "breath", featureAssetId: byCharacter.assetId }] });

      const patched = await update(
        `/api/v1/campaigns/${ID.campaign}/features/${byCharacter.id}`,
        byCharacter,
        classScaling(),
      );

      expect(patched.statusCode).toBe(409);
      expect(JSON.stringify(patched.json())).toContain("forbids that this asset depends on a class level");
    });
  });

  describe("fourth review", () => {
    it("re-reads a granted feature that another transaction is changing", async () => {
      const feature = await createFeature();
      const client = await pool.connect();

      try {
        // A concurrent change of the feature adds an ability score increase and commits meanwhile.
        await client.query("begin");
        await client.query("update features set effects = $1 where asset_id = $2", [
          JSON.stringify(asiEffect().effects),
          feature.assetId,
        ]);

        const pending = inject(GM, "POST", campaignUrl(), {
          ...ELF,
          featureGrants: [{ key: "asi", featureAssetId: feature.assetId }],
        });

        await new Promise((resolve) => setTimeout(resolve, 300));
        await client.query("commit");

        const created = await pending;

        expect(created.statusCode).toBe(409);
        expect(JSON.stringify(created.json())).toContain("ability score increases");
      } finally {
        client.release();
      }
    });

    it("reports a granted feature whose stored definition no longer parses", async () => {
      const feature = await createFeature();
      const item = await createOk({ featureGrants: [{ key: "darkvision", featureAssetId: feature.assetId }] });

      await db.execute(
        sql`update features set effects = '[{"bogus": true}]'::jsonb where asset_id = ${feature.assetId}`,
      );

      const result = await expectStatus<{ valid: boolean; issues: { message: string }[] }>(
        await inject(GM, "POST", `${itemUrl(item)}/validate`),
        200,
      );

      expect(result.issues.map((issue) => issue.message)).toContain(
        "The stored definition of the granted feature is invalid",
      );
    });
  });

  describe("released variants", () => {
    it("show their custom features only while their species is released as well", async () => {
      const magic = await createFeature({ name: "Drow Magic" });
      const item = await createOk();

      await createVariantOk(item, {
        releasedToPlayers: true,
        featureGrants: [{ key: "magic", featureAssetId: magic.assetId }],
      });

      const featureUrl = `/api/v1/campaigns/${ID.campaign}/catalog/features/${magic.id}`;

      expect((await inject(PLAYER, "GET", featureUrl)).statusCode).toBe(404);

      const current = await expectStatus<SpeciesBody>(await inject(GM, "GET", itemUrl(item)), 200);

      await expectStatus(await update(itemUrl(item), current, { releasedToPlayers: true }), 200);
      expect((await inject(PLAYER, "GET", featureUrl)).statusCode).toBe(200);
    });
  });

  describe("database", () => {
    it("allows one active species per asset, valid values and variants in the campaign of their species", async () => {
      const item = await createOk();
      const drow = await createVariantOk(item);
      const [row] = await db.select().from(species).where(eq(species.id, item.id));
      const copy = { ...row!, id: undefined, version: 1 };

      await expect(db.insert(species).values({ ...copy, code: "other" })).rejects.toMatchObject({
        cause: expect.objectContaining({ code: "23505" }),
      });
      await expect(
        db.insert(species).values({ ...copy, assetId: drow.assetId, code: "Bad Code" }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
      await expect(
        db.insert(species).values({ ...copy, assetId: drow.assetId, code: "x", sizeOptions: [] }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });

      const [variantRow] = await db.select().from(speciesVariants).where(eq(speciesVariants.id, drow.id));

      const foreignAsset = "d0000000-0000-4000-8000-0000000000ff";

      await db.insert(assets).values({
        id: foreignAsset,
        title: "Foreign",
        slug: "foreign",
        scope: "CAMPAIGN",
        origin: "CUSTOM",
        campaignId: ID.foreignCampaign,
        assetType: "SPECIES_VARIANT",
        status: "ACTIVE",
      });
      // Asset and campaign fit each other, but not the campaign of the species.
      await expect(
        db.insert(speciesVariants).values({
          ...variantRow!,
          id: undefined,
          assetId: foreignAsset,
          code: "other",
          campaignId: ID.foreignCampaign,
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({ constraint: "species_variants_species_campaign_fk" }),
      });
      await expect(
        db.insert(speciesVariants).values({ ...variantRow!, id: undefined, assetId: item.assetId, code: "x", variantGroupCode: "Bad" }),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
    });
  });
});
