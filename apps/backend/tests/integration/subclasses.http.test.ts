import { eq } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assets,
  campaignMemberships,
  campaigns,
  rulesets,
  subclasses,
  users,
} from "#core/db/schema";
import { defaultAppModules } from "#src/modules/index";
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
  selectable?: boolean;
  classId: string;
  classAssetId: string;
  selectionLevel: number;
  rulesetPolicy?: string;
  rulesetIds?: string[];
  releasedToPlayers?: boolean;
  descriptionHtml: string | null;
  levels: { level: number; featureGrants: { key: string; featureAssetId: string }[] }[];
  merged?: string[];
};

type ClassBody = Body & { subclassSelectionLevel: number };

const subclassChoice = (level = 3) => ({
  key: "subclass",
  level,
  choiceType: "SUBCLASS",
  minimumSelections: 1,
  maximumSelections: 1,
  optionFilter: { assetTypes: ["SUBCLASS"] },
  displayOrder: 0,
});

const levelsWith = (grants: Record<number, unknown[]> = {}) =>
  Array.from({ length: 20 }, (_, index) => ({ level: index + 1, featureGrants: grants[index + 1] ?? [] }));

const grant = (key: string, featureAssetId: string, extra: Record<string, unknown> = {}) => ({
  key,
  featureAssetId,
  grantOperation: "GRANT",
  displayOrder: 0,
  ...extra,
});

const barbarian = (payload: Record<string, unknown> = {}) => ({
  name: "Barbarian",
  hitDie: "D12",
  firstLevelHitPoints: 12,
  fixedHitPointsPerLevel: 7,
  subclassSelectionLevel: 3,
  primaryAbilities: { combinationMode: "ALL", abilities: ["str"] },
  choices: [subclassChoice()],
  ...payload,
});

describe("subclasses", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  let session: ReturnType<typeof buildTestApp>;

  const campaignUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/subclasses`;
  const catalogUrl = (campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/catalog/subclasses`;
  const classSubclassesUrl = (classId: string, campaignId: string = ID.campaign) =>
    `/api/v1/campaigns/${campaignId}/catalog/classes/${classId}/subclasses`;
  const systemUrl = "/api/v1/subclasses";

  const inject = (as: TestActor, method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    session.injectAs(as, { method, url, ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}) });

  const expectStatus = async <T>(response: Awaited<ReturnType<typeof inject>>, status: number): Promise<T> => {
    expect({ status: response.statusCode, body: response.statusCode === status ? null : response.json() }).toEqual({
      status,
      body: null,
    });

    return response.json() as T;
  };

  const createClass = (payload: Record<string, unknown> = {}, as: TestActor = GM, url = `/api/v1/campaigns/${ID.campaign}/classes`) =>
    inject(as, "POST", url, barbarian(payload)).then((response) => expectStatus<ClassBody>(response, 201));

  const createSystemClass = (payload: Record<string, unknown> = {}, rulesetIds: string[] = [ID.ruleset]) =>
    createClass({ rulesetPolicy: "RESTRICTED", rulesetIds, ...payload }, ADMIN, "/api/v1/classes");

  const createFeature = async (as: TestActor = GM, url = `/api/v1/campaigns/${ID.campaign}/features`, payload: Record<string, unknown> = {}) =>
    expectStatus<{ id: string; assetId: string }>(
      await inject(as, "POST", url, { name: "Frenzy", featureType: "PASSIVE", ...payload }),
      201,
    );

  const create = (payload: Record<string, unknown>, as: TestActor = GM, url = campaignUrl()) =>
    inject(as, "POST", url, { name: "Path of the Berserker", ...payload });

  const createOk = async (payload: Record<string, unknown>, as: TestActor = GM, url = campaignUrl()) =>
    expectStatus<Body>(await create(payload, as, url), 201);

  const itemUrl = (item: Body) =>
    item.campaignId ? `${campaignUrl(item.campaignId)}/${item.id}` : `${systemUrl}/${item.id}`;

  const update = (item: Body, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", itemUrl(item), {
      expectedVersion: item.version,
      expectedAssetVersion: item.assetVersion,
      ...payload,
    });

  const remove = (item: { assetVersion: number }, url: string, as: TestActor = GM) =>
    inject(as, "DELETE", `${url}?expectedAssetVersion=${item.assetVersion}`);

  const classUrl = (item: ClassBody) =>
    item.campaignId ? `/api/v1/campaigns/${item.campaignId}/classes/${item.id}` : `/api/v1/classes/${item.id}`;

  const updateClass = (item: ClassBody, payload: Record<string, unknown>, as: TestActor = GM) =>
    inject(as, "PATCH", classUrl(item), {
      expectedVersion: item.version,
      expectedAssetVersion: item.assetVersion,
      ...payload,
    });

  const subclassCount = async () => (await db.select().from(subclasses)).length;
  const subclassAssetCount = async () =>
    (await db.select().from(assets).where(eq(assets.assetType, "SUBCLASS"))).length;

  beforeEach(async () => {
    session = buildTestApp({ modules: defaultAppModules });

    await db.insert(rulesets).values(
      [
        { id: ID.ruleset, code: "SUBCLASSES_2024", editionYear: 2024 },
        { id: ID.otherRuleset, code: "SUBCLASSES_2014", editionYear: 2014 },
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
      { campaignId: ID.foreignCampaign, userId: ID.foreignGm, role: "EDITOR", createdBy: ID.foreignGm },
    ]);
  });

  afterEach(async () => {
    await session.app.close();
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("custom subclasses", () => {
    it("creates asset and subclass in one go for a class of the campaign", async () => {
      const base = await createClass();
      const feature = await createFeature();
      const item = await createOk({
        classId: base.id,
        description: "Frenzy **hard** <script>alert(1)</script>",
        levels: [{ level: 3, featureGrants: [grant("frenzy", feature.assetId)] }],
      });

      expect(item).toMatchObject({
        view: "FULL",
        campaignId: ID.campaign,
        code: "path-of-the-berserker",
        status: "ACTIVE",
        classId: base.id,
        classAssetId: base.assetId,
        selectionLevel: 3,
        selectable: true,
        releasedToPlayers: false,
      });
      expect(item.descriptionHtml).toContain("<strong>hard</strong>");
      expect(item.descriptionHtml).not.toContain("<script>");

      const [asset] = await db.select().from(assets).where(eq(assets.id, item.assetId));

      expect(asset).toMatchObject({ assetType: "SUBCLASS", scope: "CAMPAIGN", origin: "CUSTOM" });
      expect((await inject(EDITOR, "GET", `${campaignUrl()}/${item.id}`)).statusCode).toBe(200);
    });

    it("builds custom subclasses on global classes and takes their ruleset policy", async () => {
      const global = await createSystemClass();
      const item = await createOk({ classId: global.id });

      expect(item).toMatchObject({
        classId: global.id,
        rulesetPolicy: "RESTRICTED",
        rulesetIds: [ID.ruleset],
      });

      // Custom subclasses of global classes are campaign content: the global list doesn't show them.
      const list = (await inject(ADMIN, "GET", `${systemUrl}?classId=${global.id}`)).json().data as Body[];

      expect(list).toEqual([]);
    });

    it("refuses invalid input, missing rights, foreign campaigns and foreign classes", async () => {
      const base = await createClass();

      expect((await create({})).statusCode).toBe(400);
      expect((await create({ classId: base.id, code: "Not A Slug" })).statusCode).toBe(400);
      expect((await create({ classId: base.id }, PLAYER)).statusCode).toBe(403);
      expect((await create({ classId: base.id }, OUTSIDER)).statusCode).toBe(404);
      // A class of another campaign is not there for this one.
      expect((await create({ classId: base.id }, FOREIGN_GM, campaignUrl(ID.foreignCampaign))).statusCode).toBe(404);
      expect((await create({ classId: ID.unknown })).statusCode).toBe(404);
      expect(await subclassCount()).toBe(0);
      expect(await subclassAssetCount()).toBe(0);

      const item = await createOk({ classId: base.id });

      expect((await inject(FOREIGN_GM, "GET", `${campaignUrl(ID.foreignCampaign)}/${item.id}`)).statusCode).toBe(404);
      expect((await inject(OUTSIDER, "GET", `${campaignUrl()}/${item.id}`)).statusCode).toBe(404);
    });

    it("keeps codes unique per class and rolls back the whole action", async () => {
      const base = await createClass();
      const other = await createClass({ name: "Fighter", code: "fighter" });

      await createOk({ classId: base.id, code: "zealot" });

      expect((await create({ classId: base.id, code: "zealot" })).statusCode).toBe(409);
      // Neither the asset nor the subclass of the refused request stays.
      expect(await subclassAssetCount()).toBe(1);
      expect(await subclassCount()).toBe(1);

      await createOk({ classId: other.id, code: "zealot" });
    });

    it("updates with versions, reports conflicts and archives instead of deleting", async () => {
      const base = await createClass();
      const item = await createOk({ classId: base.id });
      const updated = await expectStatus<Body>(await update(item, { name: "Zealot", description: "Divine fury" }), 200);

      expect(updated).toMatchObject({ name: "Zealot", merged: [] });
      expect((await update(item, { description: "Stale" })).statusCode).toBe(412);
      expect((await update(updated, { classId: ID.unknown })).statusCode).toBe(400);

      const archived = await expectStatus<Body>(await remove(updated, `${campaignUrl()}/${updated.id}`), 200);

      expect(archived).toMatchObject({ status: "ARCHIVED", selectable: false });
      // Soft delete: the row stays and can be restored.
      expect(await subclassCount()).toBe(1);
      expect((await update(archived, { name: "Again" })).statusCode).toBe(409);

      const restored = await expectStatus<Body>(
        await inject(GM, "POST", `${campaignUrl()}/${item.id}/restore`, { expectedAssetVersion: archived.assetVersion }),
        200,
      );

      expect(restored.status).toBe("ACTIVE");
    });
  });

  describe("rules against the class", () => {
    it("follows the selection level of the class (2024: 3, a 2014 cleric: 1)", async () => {
      const feature = await createFeature();
      const barbarian2024 = await createClass();
      const cleric2014 = await createClass({ name: "Cleric", code: "cleric", subclassSelectionLevel: 1, choices: [subclassChoice(1)] });
      const levelOne = { levels: [{ level: 1, featureGrants: [grant("blessed", feature.assetId)] }] };

      const refused = await create({ classId: barbarian2024.id, ...levelOne });

      expect(refused.statusCode).toBe(409);
      expect(JSON.stringify(refused.json())).toContain("subclass selection level 3");
      expect(await subclassAssetCount()).toBe(0);

      const domain = await createOk({ classId: cleric2014.id, ...levelOne });

      expect(domain.selectionLevel).toBe(1);
    });

    it("upgrades and replaces only features the class or subclass grants by then", async () => {
      const rage = await createFeature(GM, undefined, { name: "Rage" });
      const mindless = await createFeature(GM, undefined, { name: "Mindless Rage" });
      const base = await createClass({ levels: levelsWith({ 1: [grant("rage", rage.assetId)] }) });
      const upgrade = (targetFeatureAssetId: string, operation = "UPGRADE") => ({
        classId: base.id,
        levels: [{ level: 6, featureGrants: [grant("mindless", mindless.assetId, { grantOperation: operation, targetFeatureAssetId })] }],
      });

      expect((await create(upgrade(rage.assetId))).statusCode).toBe(201);
      expect((await create({ ...upgrade(rage.assetId, "REPLACE"), code: "replacer" })).statusCode).toBe(201);

      const other = await createFeature(GM, undefined, { name: "Other" });
      const refused = await create({ ...upgrade(other.assetId), code: "nothing" });

      expect(refused.statusCode).toBe(409);
      expect(JSON.stringify(refused.json())).toContain("must grant the target feature");
    });

    it("refuses referenced assets of the wrong type, of other campaigns or unknown", async () => {
      const base = await createClass();
      const foreignFeature = await createFeature(FOREIGN_GM, `/api/v1/campaigns/${ID.foreignCampaign}/features`);
      const levels = (featureAssetId: string) => [{ level: 3, featureGrants: [grant("frenzy", featureAssetId)] }];

      expect((await create({ classId: base.id, levels: levels(ID.unknown) })).statusCode).toBe(404);
      expect((await create({ classId: base.id, levels: levels(foreignFeature.assetId) })).statusCode).toBe(404);
      expect((await create({ classId: base.id, levels: levels(base.assetId) })).statusCode).toBe(409);
      expect(await subclassCount()).toBe(0);
    });

    it("keeps global subclasses on global classes covering their rulesets", async () => {
      const global = await createSystemClass();
      const custom = await createClass();

      // Without a policy the subclass takes the rulesets of the class.
      const inherited = await createOk({ classId: global.id }, ADMIN, systemUrl);

      expect(inherited).toMatchObject({ campaignId: null, rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset] });

      expect((await create({ classId: custom.id, code: "x" }, ADMIN, systemUrl)).statusCode).toBe(404);
      expect((await create({ classId: global.id, code: "y" }, GM, systemUrl)).statusCode).toBe(403);

      const wrongRuleset = await create(
        { classId: global.id, code: "z", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.otherRuleset] },
        ADMIN,
        systemUrl,
      );

      expect(wrongRuleset.statusCode).toBe(409);
      expect(JSON.stringify(wrongRuleset.json())).toContain("not available for all rulesets");

      const old = await createSystemClass({ code: "barbarian-2014" }, [ID.otherRuleset]);
      const forOtherRuleset = await create({ classId: old.id, code: "old" });

      expect(forOtherRuleset.statusCode).toBe(409);
      expect(JSON.stringify(forOtherRuleset.json())).toContain("not available for the campaign ruleset");
    });

    it("refuses class changes that break a subclass, at the end of the class's action", async () => {
      const feature = await createFeature();
      const base = await createClass();
      const item = await createOk({
        classId: base.id,
        name: "Totem Warrior",
        levels: [{ level: 3, featureGrants: [grant("spirit", feature.assetId)] }],
      });

      // The subclass grants at 3; a selection at 5 would leave it with grants it can't have.
      const later = await updateClass(base, { subclassSelectionLevel: 5, choices: [subclassChoice(5)] });

      expect(later.statusCode).toBe(409);
      expect(JSON.stringify(later.json())).toContain("Totem Warrior");
      expect(JSON.stringify(later.json())).toContain(item.id);

      // Spellcasting of the class next to that of a subclass.
      const knight = await createOk({
        classId: base.id,
        code: "knight",
        spellcasting: {
          castingType: "THIRD",
          spellcastingAbility: "int",
          unlockLevel: 3,
          preparationMode: "KNOWN",
          multiclassNumerator: 1,
          multiclassDenominator: 3,
          multiclassRounding: "DOWN",
        },
      });

      expect(knight.code).toBe("knight");

      const fresh = await expectStatus<ClassBody>(await inject(GM, "GET", classUrl(base)), 200);
      const caster = await updateClass(fresh, {
        spellcasting: {
          castingType: "HALF",
          spellcastingAbility: "wis",
          unlockLevel: 2,
          preparationMode: "PREPARED",
          multiclassNumerator: 1,
          multiclassDenominator: 2,
          multiclassRounding: "DOWN",
        },
      });

      expect(caster.statusCode).toBe(409);

      // Changes that keep every subclass fitting go through.
      expect((await updateClass(fresh, { description: "Fine" })).statusCode).toBe(200);
    });

    it("checks only the class rules of dependent subclasses, so their other issues don't block the class", async () => {
      const feature = await createFeature();
      const base = await createClass();
      const item = await createOk({
        classId: base.id,
        name: "Broken Elsewhere",
        levels: [{ level: 3, featureGrants: [grant("frenzy", feature.assetId)] }],
      });

      // A reference that broke outside of any class change.
      await db
        .update(subclasses)
        .set({ levels: [{ level: 3, featureGrants: [{ ...grant("frenzy", ID.unknown), targetFeatureAssetId: null, isRequired: true, choiceKey: null, bindings: [] }] }] })
        .where(eq(subclasses.id, item.id));

      expect((await updateClass(base, { description: "Typo fixed" })).statusCode).toBe(200);

      const fresh = await expectStatus<ClassBody>(await inject(GM, "GET", classUrl(base)), 200);
      const later = await updateClass(fresh, { subclassSelectionLevel: 5, choices: [subclassChoice(5)] });

      expect(later.statusCode).toBe(409);
      expect(JSON.stringify(later.json())).toContain("Broken Elsewhere");
    });

    it("keeps admins from narrowing or drafting a global class that campaigns build on", async () => {
      const global = await createSystemClass({}, [ID.ruleset, ID.otherRuleset]);

      await createOk({ classId: global.id });

      const narrowed = await updateClass(global, { rulesetIds: [ID.otherRuleset] }, ADMIN);

      expect(narrowed.statusCode).toBe(409);
      expect(JSON.stringify(narrowed.json())).toContain("not available for the campaign ruleset");

      expect((await updateClass(global, { status: "DRAFT" }, ADMIN)).statusCode).toBe(409);
    });

    it("keeps a class with active subclasses from being archived and an archived class from new or restored ones", async () => {
      const base = await createClass();
      const item = await createOk({ classId: base.id });

      expect((await remove(base, classUrl(base))).statusCode).toBe(409);

      const archivedSubclass = await expectStatus<Body>(await remove(item, `${campaignUrl()}/${item.id}`), 200);
      const archivedClass = await expectStatus<ClassBody>(await remove(base, classUrl(base)), 200);

      expect(archivedClass.status).toBe("ARCHIVED");
      expect((await create({ classId: base.id, code: "late" })).statusCode).toBe(409);

      const restore = await inject(GM, "POST", `${campaignUrl()}/${item.id}/restore`, {
        expectedAssetVersion: archivedSubclass.assetVersion,
      });

      expect(restore.statusCode).toBe(409);
      expect(JSON.stringify(restore.json())).toContain("The class is archived");
    });

    it("validates a stored subclass against the current state", async () => {
      const feature = await createFeature();
      const base = await createClass();
      const item = await createOk({
        classId: base.id,
        levels: [{ level: 3, featureGrants: [grant("frenzy", feature.assetId)] }],
      });
      const url = `${campaignUrl()}/${item.id}/validate`;

      expect((await inject(GM, "POST", url)).json()).toEqual({ subclassId: item.id, valid: true, issues: [] });

      // Changed behind the kernel's back: the check finds it.
      await db.update(subclasses).set({ levels: [{ level: 1, featureGrants: [] }] }).where(eq(subclasses.id, item.id));

      const result = (await inject(GM, "POST", url)).json() as { valid: boolean; issues: { message: string }[] };

      expect(result.valid).toBe(false);
      expect(result.issues.map((issue) => issue.message).join()).toContain("subclass selection level");
      expect((await inject(PLAYER, "POST", url)).statusCode).toBe(403);
    });
  });

  describe("catalog", () => {
    it("lists the subclasses of a class: global ones and the campaign's own, for players only released ones", async () => {
      const global = await createSystemClass();
      const champion = await createOk({ classId: global.id, name: "Champion" }, ADMIN, systemUrl);
      const draft = await createOk({ classId: global.id, name: "Draft", status: "DRAFT" }, ADMIN, systemUrl);
      const own = await createOk({ classId: global.id, name: "Homebrew" });
      const listed = async (as: TestActor) =>
        ((await inject(as, "GET", classSubclassesUrl(global.id))).json().data as Body[]).map((item) => item.name);

      expect(await listed(GM)).toEqual(["Champion", "Homebrew"]);
      expect(await listed(PLAYER)).toEqual(["Champion"]);
      expect(draft.status).toBe("DRAFT");

      await expectStatus(await update(own, { releasedToPlayers: true }), 200);

      expect(await listed(PLAYER)).toEqual(["Champion", "Homebrew"]);

      const response = (await inject(PLAYER, "GET", classSubclassesUrl(global.id))).json();

      expect(response).toMatchObject({ classId: global.id, classAssetId: global.assetId, selectionLevel: 3 });
      expect(response.data[0]).toEqual({
        view: "PLAYER",
        id: champion.id,
        assetId: champion.assetId,
        scope: "SYSTEM",
        name: "Champion",
        summary: null,
        classId: global.id,
        classAssetId: global.assetId,
        code: "champion",
        displayOrder: 0,
        selectionLevel: 3,
        selectable: true,
      });
      expect((await inject(OUTSIDER, "GET", classSubclassesUrl(global.id))).statusCode).toBe(404);
    });

    it("hides released subclasses of classes the player can't see, and what they grant", async () => {
      const feature = await createFeature();
      const base = await createClass();
      const item = await createOk({
        classId: base.id,
        releasedToPlayers: true,
        levels: [{ level: 3, featureGrants: [grant("frenzy", feature.assetId)] }],
      });
      const featureUrl = `/api/v1/campaigns/${ID.campaign}/features/${feature.id}`;

      // The subclass doesn't reveal its custom feature while the class is hidden.
      expect((await inject(PLAYER, "GET", featureUrl)).statusCode).toBe(404);

      expect((await inject(PLAYER, "GET", classSubclassesUrl(base.id))).statusCode).toBe(404);
      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`)).statusCode).toBe(404);
      expect(((await inject(PLAYER, "GET", campaignUrl())).json().data as Body[])).toEqual([]);

      await expectStatus(await updateClass(base, { releasedToPlayers: true }), 200);

      expect((await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`)).statusCode).toBe(200);
      expect(((await inject(PLAYER, "GET", campaignUrl())).json().data as Body[]).map((entry) => entry.id)).toEqual([item.id]);
      expect((await inject(PLAYER, "GET", featureUrl)).statusCode).toBe(200);
    });

    it("shows the player view with the custom features a released subclass grants", async () => {
      const feature = await createFeature();
      const base = await createClass({ releasedToPlayers: true });
      const item = await createOk({
        classId: base.id,
        releasedToPlayers: true,
        levels: [{ level: 3, featureGrants: [grant("frenzy", feature.assetId)] }],
      });
      const detail = (await inject(PLAYER, "GET", `${catalogUrl()}/${item.id}`)).json() as Body & Record<string, unknown>;

      expect(detail.view).toBe("PLAYER");
      expect(detail.levels[0]?.featureGrants.map((entry) => entry.key)).toEqual(["frenzy"]);
      expect(detail).not.toHaveProperty("rulesetIds");
      expect(detail).not.toHaveProperty("releasedToPlayers");
      expect(detail).not.toHaveProperty("createdBy");

      // The released subclass makes its custom feature visible to the player.
      expect((await inject(PLAYER, "GET", `/api/v1/campaigns/${ID.campaign}/features/${feature.id}`)).statusCode).toBe(200);
    });

    it("answers the sections of the catalog detail", async () => {
      const feature = await createFeature();
      const base = await createClass();
      const item = await createOk({
        classId: base.id,
        levels: [{ level: 3, featureGrants: [grant("frenzy", feature.assetId)] }],
        progressionTracks: [{ key: "dice", label: "Dice", valueType: "INTEGER", displayOrder: 0, values: [{ level: 3, value: 2 }] }],
      });
      const section = async (name: string) =>
        expectStatus<Record<string, unknown>>(await inject(GM, "GET", `${catalogUrl()}/${item.id}/${name}`), 200);

      const progression = (await section("progression")) as { levels: { level: number; featureGrantKeys: string[] }[] };

      expect(progression.levels).toHaveLength(18);
      expect(progression.levels[0]).toMatchObject({ level: 3, featureGrantKeys: ["frenzy"] });
      expect(await section("features")).toMatchObject({ grants: [{ key: "frenzy", level: 3 }] });
      expect(await section("choices")).toMatchObject({ selectionLevel: 3, choices: [] });
      expect(await section("spellcasting")).toMatchObject({ spellcasting: null, spellGrants: [] });
    });

    it("lists the subclasses of a class as its usages", async () => {
      const base = await createClass();
      const item = await createOk({ classId: base.id });
      const usages = (await inject(GM, "GET", `/api/v1/campaigns/${ID.campaign}/classes/${base.id}/usages`)).json();

      expect(usages.typedUsages).toEqual([
        expect.objectContaining({
          id: item.assetId,
          type: "SUBCLASS_BASE_CLASS",
          assetType: "SUBCLASS",
          editRoute: `/campaigns/${ID.campaign}/subclasses/${item.id}`,
        }),
      ]);
    });
  });

  describe("selection", () => {
    it("checks whether a class assignment may take the subclass", async () => {
      const feature = await createFeature();
      const mindless = await createFeature(GM, undefined, { name: "Mindless Rage" });
      const base = await createClass({ releasedToPlayers: true });
      const other = await createClass({ name: "Fighter", code: "fighter", releasedToPlayers: true });
      const item = await createOk({
        classId: base.id,
        releasedToPlayers: true,
        levels: [
          { level: 3, featureGrants: [grant("frenzy", feature.assetId)] },
          { level: 6, featureGrants: [grant("mindless", mindless.assetId, { grantOperation: "UPGRADE", targetFeatureAssetId: feature.assetId })] },
        ],
      });
      const second = await createOk({ classId: base.id, code: "second", releasedToPlayers: true });
      const check = async (body: Record<string, unknown>, as: TestActor = PLAYER) =>
        expectStatus<{ valid: boolean; issues: { code: string }[]; grantKeys: string[] }>(
          await inject(as, "POST", `${catalogUrl()}/${item.id}/selection-check`, body),
          200,
        );

      expect(await check({ classId: base.id, classLevel: 5 })).toMatchObject({
        valid: true,
        issues: [],
        grantKeys: ["frenzy"],
      });
      expect((await check({ classId: other.id, classLevel: 5 })).issues.map((issue) => issue.code)).toEqual(["WRONG_CLASS"]);
      expect((await check({ classId: base.id, classLevel: 2 })).issues.map((issue) => issue.code)).toEqual(["CLASS_LEVEL_TOO_LOW"]);
      // One subclass per class assignment; a character with two classes has two assignments.
      expect(
        (await check({ classId: base.id, classLevel: 5, currentSubclassId: second.id })).issues.map((issue) => issue.code),
      ).toEqual(["SUBCLASS_ALREADY_CHOSEN"]);
      expect((await check({ classId: base.id, classLevel: 5, currentSubclassId: item.id })).valid).toBe(true);
      expect((await inject(PLAYER, "POST", `${catalogUrl()}/${item.id}/selection-check`, { classId: base.id, classLevel: 0 })).statusCode).toBe(400);

      // A class with ten levels has no level 15.
      const short = await createClass({ name: "Sidekick", code: "sidekick", maximumLevel: 10, releasedToPlayers: true });
      const shortSubclass = await createOk({ classId: short.id, code: "short", releasedToPlayers: true });
      const tooHigh = await expectStatus<{ issues: { code: string }[]; grantKeys: string[] }>(
        await inject(PLAYER, "POST", `${catalogUrl()}/${shortSubclass.id}/selection-check`, { classId: short.id, classLevel: 15 }),
        200,
      );

      expect(tooHigh.issues.map((issue) => issue.code)).toEqual(["CLASS_LEVEL_TOO_HIGH"]);
      expect(tooHigh.grantKeys).toEqual([]);

      // Archived: players no longer find it; GMs see why it can't be chosen.
      await expectStatus(await remove(item, `${campaignUrl()}/${item.id}`), 200);

      expect((await inject(PLAYER, "POST", `${catalogUrl()}/${item.id}/selection-check`, { classId: base.id, classLevel: 5 })).statusCode).toBe(404);
    });
  });
});
