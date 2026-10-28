import { createDrizzleDb, createPgPool } from "#core/db/pool";
import type { AppModule } from "#core/app/moduleSystem";
import {
  assetFamilies,
  assetRulesets,
  assets,
  campaignMemberships,
  campaigns,
  rulesets,
  users,
} from "#core/db/schema";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
} from "#src/modules/assets/index";
import { defaultAppModules } from "#src/modules/index";
import { buildTestApp, type TestActor } from "#test/helpers/buildTestApp";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ID = {
  ruleset2014: "10000000-0000-4000-8000-000000002014",
  ruleset2024: "10000000-0000-4000-8000-000000002024",
  gm: "a0000000-0000-4000-8000-000000000001",
  player: "a0000000-0000-4000-8000-000000000002",
  outsider: "a0000000-0000-4000-8000-000000000003",
  admin: "a0000000-0000-4000-8000-000000000004",
  campaignA: "c0000000-0000-4000-8000-00000000000a",
  campaignB: "c0000000-0000-4000-8000-00000000000b",
  fireballFamily: "f0000000-0000-4000-8000-000000000001",
  systemLight: "e0000000-0000-4000-8000-000000000001",
  systemFireball2014: "e0000000-0000-4000-8000-000000000002",
  systemFireball2024: "e0000000-0000-4000-8000-000000000003",
  systemShield: "e0000000-0000-4000-8000-000000000004",
  systemDraft: "e0000000-0000-4000-8000-000000000005",
  systemArchived: "e0000000-0000-4000-8000-000000000006",
  campaignSpell: "e0000000-0000-4000-8000-000000000007",
  campaignDraft: "e0000000-0000-4000-8000-000000000008",
  campaignNpc: "e0000000-0000-4000-8000-000000000009",
  campaignDeleted: "e0000000-0000-4000-8000-00000000000a",
  foreignSpell: "e0000000-0000-4000-8000-00000000000b",
} as const;

const GM: TestActor = { actorId: ID.gm, systemRole: "USER" };
const PLAYER: TestActor = { actorId: ID.player, systemRole: "USER" };
const OUTSIDER: TestActor = { actorId: ID.outsider, systemRole: "USER" };
const ADMIN: TestActor = { actorId: ID.admin, systemRole: "ADMIN" };

/** Grants the player visibility of one campaign asset, standing in for content shares. */
const testVisibilityModule: AppModule = {
  name: "test-asset-visibility",
  dependencies: ["assets"],
  register: (_app, container) => {
    container.dependencies
      .require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES)
      .service.registerVisibilityProvider({
        name: "test-shares",
        listVisibleAssetIds: async ({ campaignId, actorId }) =>
          campaignId === ID.campaignA && actorId === ID.player
            ? [ID.campaignSpell, ID.campaignDraft]
            : [],
      });
  },
};

function titles(body: { data: Array<{ title: string }> }): string[] {
  return body.data.map((item) => item.title);
}

describe("assets HTTP routes", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const { app, injectAs } = buildTestApp({
    modules: [...defaultAppModules, testVisibilityModule],
  });

  beforeEach(async () => {
    await db.insert(rulesets).values(
      [ID.ruleset2014, ID.ruleset2024].map((id, index) => ({
        id,
        code: `DND_5E_IT_ASSETS_${index}`,
        name: `D&D 5E ${index === 0 ? 2014 : 2024}`,
        status: "ACTIVE" as const,
        editionYear: index === 0 ? 2014 : 2024,
        sourceReference: {},
        licenseCode: "TEST",
      })),
    );

    await db.insert(users).values(
      [
        [ID.gm, "USER"],
        [ID.player, "USER"],
        [ID.outsider, "USER"],
        [ID.admin, "ADMIN"],
      ].map(([id, systemRole]) => ({
        id: id as string,
        email: `${id}@example.test`,
        passwordHash: "hash",
        displayName: "Test",
        systemRole: systemRole as "USER" | "ADMIN",
        status: "ACTIVE" as const,
        emailVerifiedAt: new Date(),
      })),
    );

    await db.insert(campaigns).values([
      {
        id: ID.campaignA,
        ownerUserId: ID.gm,
        rulesetId: ID.ruleset2024,
        name: "Campaign A",
        slug: "campaign-a",
        status: "ACTIVE",
        createdBy: ID.gm,
      },
      {
        id: ID.campaignB,
        ownerUserId: ID.outsider,
        rulesetId: ID.ruleset2024,
        name: "Campaign B",
        slug: "campaign-b",
        status: "ACTIVE",
        createdBy: ID.outsider,
      },
    ]);

    await db.insert(campaignMemberships).values([
      { campaignId: ID.campaignA, userId: ID.gm, role: "EDITOR", createdBy: ID.gm },
      { campaignId: ID.campaignA, userId: ID.player, role: "PLAYER", createdBy: ID.gm },
      { campaignId: ID.campaignB, userId: ID.outsider, role: "EDITOR", createdBy: ID.outsider },
    ]);

    await db.insert(assetFamilies).values({
      id: ID.fireballFamily,
      assetType: "SPELL",
      code: "fireball",
      name: "Fireball",
    });

    const system = { scope: "SYSTEM", origin: "DEFAULT", campaignId: null } as const;
    const campaignA = { scope: "CAMPAIGN", origin: "CUSTOM", campaignId: ID.campaignA } as const;

    await db.insert(assets).values([
      { ...system, id: ID.systemLight, assetType: "SPELL", title: "Light", slug: "light", status: "ACTIVE" },
      {
        ...system,
        id: ID.systemFireball2014,
        assetType: "SPELL",
        title: "Fireball (2014)",
        slug: "fireball-2014",
        status: "ACTIVE",
        rulesetPolicy: "RESTRICTED",
        assetFamilyId: ID.fireballFamily,
      },
      {
        ...system,
        id: ID.systemFireball2024,
        assetType: "SPELL",
        title: "Fireball (2024)",
        slug: "fireball-2024",
        status: "ACTIVE",
        rulesetPolicy: "RESTRICTED",
        assetFamilyId: ID.fireballFamily,
      },
      {
        ...system,
        id: ID.systemShield,
        assetType: "SPELL",
        title: "Shield",
        slug: "shield",
        status: "ACTIVE",
        rulesetPolicy: "RESTRICTED",
      },
      { ...system, id: ID.systemDraft, assetType: "SPELL", title: "Wish (draft)", slug: "wish", status: "DRAFT" },
      { ...system, id: ID.systemArchived, assetType: "SPELL", title: "Old Spell", slug: "old-spell", status: "ARCHIVED" },
      { ...campaignA, id: ID.campaignSpell, assetType: "SPELL", title: "Ember Lance", slug: "ember-lance", status: "ACTIVE" },
      { ...campaignA, id: ID.campaignDraft, assetType: "SPELL", title: "Secret Draft", slug: "secret-draft", status: "DRAFT" },
      { ...campaignA, id: ID.campaignNpc, assetType: "NPC", title: "Mira", slug: "mira", status: "ACTIVE" },
      {
        ...campaignA,
        id: ID.campaignDeleted,
        assetType: "SPELL",
        title: "Deleted Spell",
        slug: "deleted-spell",
        status: "ACTIVE",
        deletedAt: new Date(),
      },
      {
        scope: "CAMPAIGN",
        origin: "CUSTOM",
        campaignId: ID.campaignB,
        id: ID.foreignSpell,
        assetType: "SPELL",
        title: "Foreign Spell",
        slug: "foreign-spell",
        status: "ACTIVE",
      },
    ]);

    await db.insert(assetRulesets).values([
      { assetId: ID.systemFireball2014, rulesetId: ID.ruleset2014 },
      { assetId: ID.systemFireball2024, rulesetId: ID.ruleset2024 },
      { assetId: ID.systemShield, rulesetId: ID.ruleset2014 },
      { assetId: ID.systemShield, rulesetId: ID.ruleset2024 },
    ]);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  describe("campaign asset list", () => {
    it("shows the GM all non-deleted assets of the own campaign with full metadata", async () => {
      const response = await injectAs(GM, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/assets`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(titles(body)).toEqual(["Ember Lance", "Mira", "Secret Draft"]);
      expect(body.pageInfo.total).toBe(3);
      expect(body.data[0]).toMatchObject({ view: "GM", status: "ACTIVE", slug: "ember-lance" });
    });

    it("shows players only shared active assets without GM metadata", async () => {
      const response = await injectAs(PLAYER, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/assets`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(titles(body)).toEqual(["Ember Lance"]);
      expect(Object.keys(body.data[0]).sort()).toEqual(
        ["assetType", "id", "scope", "summary", "title", "view"],
      );
    });

    it("hides foreign campaigns and filters by type", async () => {
      const foreign = await injectAs(OUTSIDER, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/assets`,
      });
      expect(foreign.statusCode).toBe(404);

      const npcs = await injectAs(GM, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/assets?assetType=NPC`,
      });
      expect(titles(npcs.json())).toEqual(["Mira"]);
    });
  });

  describe("catalogs", () => {
    it("merges compatible system and campaign definitions without duplicates", async () => {
      const response = await injectAs(GM, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/catalog/SPELL`,
      });

      expect(response.statusCode).toBe(200);
      expect(titles(response.json())).toEqual([
        "Ember Lance",
        "Fireball (2024)",
        "Light",
        "Secret Draft",
        "Shield",
      ]);
    });

    it("limits the player catalog to active system and shared campaign definitions", async () => {
      const response = await injectAs(PLAYER, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/catalog/SPELL`,
      });

      expect(titles(response.json())).toEqual(["Ember Lance", "Fireball (2024)", "Light", "Shield"]);
      expect(response.json().data.every((item: { view: string }) => item.view === "PLAYER")).toBe(
        true,
      );
    });

    it("filters the global catalog by ruleset and paginates with cursors", async () => {
      const filtered = await injectAs(PLAYER, {
        method: "GET",
        url: `/api/v1/catalog/SPELL?ruleset=${ID.ruleset2014}`,
      });
      expect(titles(filtered.json())).toEqual(["Fireball (2014)", "Light", "Shield"]);

      const firstPage = await injectAs(PLAYER, {
        method: "GET",
        url: "/api/v1/catalog/SPELL?limit=3",
      });
      const firstBody = firstPage.json();
      expect(titles(firstBody)).toEqual(["Fireball (2014)", "Fireball (2024)", "Light"]);
      expect(firstBody.pageInfo.nextCursor).toEqual(expect.any(String));

      const secondPage = await injectAs(PLAYER, {
        method: "GET",
        url: `/api/v1/catalog/SPELL?limit=3&cursor=${firstBody.pageInfo.nextCursor}`,
      });
      expect(titles(secondPage.json())).toEqual(["Shield"]);
      expect(secondPage.json().pageInfo.nextCursor).toBeNull();
    });
  });

  describe("asset detail", () => {
    it("returns role-dependent views and hides unshared or foreign assets", async () => {
      const gm = await injectAs(GM, { method: "GET", url: `/api/v1/assets/${ID.campaignDraft}` });
      expect(gm.statusCode).toBe(200);
      expect(gm.json()).toMatchObject({ view: "GM", status: "DRAFT", rulesetIds: [] });

      const shared = await injectAs(PLAYER, { method: "GET", url: `/api/v1/assets/${ID.campaignSpell}` });
      expect(shared.statusCode).toBe(200);
      expect(shared.json()).toEqual({
        view: "PLAYER",
        id: ID.campaignSpell,
        assetType: "SPELL",
        title: "Ember Lance",
        summary: null,
        scope: "CAMPAIGN",
      });

      for (const [actor, assetId] of [
        [PLAYER, ID.campaignNpc],
        [PLAYER, ID.campaignDraft],
        [OUTSIDER, ID.campaignSpell],
        [GM, ID.foreignSpell],
        [GM, ID.campaignDeleted],
        [PLAYER, ID.systemDraft],
      ] as const) {
        const response = await injectAs(actor, { method: "GET", url: `/api/v1/assets/${assetId}` });
        expect(response.statusCode).toBe(404);
      }
    });

    it("returns active system definitions to any authenticated user", async () => {
      const response = await injectAs(OUTSIDER, {
        method: "GET",
        url: `/api/v1/assets/${ID.systemFireball2024}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ view: "PLAYER", title: "Fireball (2024)" });
    });
  });

  describe("access by role", () => {
    it("lets system admins read every campaign and asset with the GM view", async () => {
      const ownList = await injectAs(ADMIN, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/assets`,
      });
      expect(ownList.statusCode).toBe(200);
      expect(titles(ownList.json())).toEqual(["Ember Lance", "Mira", "Secret Draft"]);
      expect(ownList.json().data.every((item: { view: string }) => item.view === "GM")).toBe(true);

      const foreignList = await injectAs(ADMIN, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignB}/assets`,
      });
      expect(foreignList.statusCode).toBe(200);
      expect(titles(foreignList.json())).toEqual(["Foreign Spell"]);

      const campaignCatalog = await injectAs(ADMIN, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/catalog/SPELL`,
      });
      expect(campaignCatalog.statusCode).toBe(200);
      expect(titles(campaignCatalog.json())).toContain("Secret Draft");

      for (const assetId of [ID.campaignDraft, ID.foreignSpell, ID.systemDraft, ID.systemArchived]) {
        const response = await injectAs(ADMIN, { method: "GET", url: `/api/v1/assets/${assetId}` });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({ view: "GM", id: assetId });
      }

      const globalCatalog = await injectAs(ADMIN, { method: "GET", url: "/api/v1/catalog/SPELL" });
      expect(globalCatalog.json().data.every((item: { view: string }) => item.view === "GM")).toBe(
        true,
      );
    });

    it("keeps GMs, players and non-members out of campaigns they do not belong to", async () => {
      for (const [actor, url] of [
        [GM, `/api/v1/campaigns/${ID.campaignB}/assets`],
        [GM, `/api/v1/campaigns/${ID.campaignB}/catalog/SPELL`],
        [PLAYER, `/api/v1/campaigns/${ID.campaignB}/assets`],
        [PLAYER, `/api/v1/campaigns/${ID.campaignB}/catalog/SPELL`],
        [PLAYER, `/api/v1/assets/${ID.foreignSpell}`],
        [OUTSIDER, `/api/v1/campaigns/${ID.campaignA}/catalog/SPELL`],
      ] as const) {
        const response = await injectAs(actor, { method: "GET", url });
        expect(response.statusCode).toBe(404);
      }
    });

    it("hides unshared campaign definitions from the player catalog", async () => {
      const gm = await injectAs(GM, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/catalog/NPC`,
      });
      expect(titles(gm.json())).toEqual(["Mira"]);

      const player = await injectAs(PLAYER, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/catalog/NPC`,
      });
      expect(player.statusCode).toBe(200);
      expect(titles(player.json())).toEqual([]);
    });

    it("forbids GMs and players from changing, archiving or restoring definitions", async () => {
      for (const actor of [GM, PLAYER]) {
        const update = await injectAs(actor, {
          method: "PATCH",
          url: `/api/v1/assets/${ID.campaignSpell}`,
          payload: { expectedVersion: 1, title: "Hijacked" },
        });
        expect(update.statusCode).toBe(403);

        const archive = await injectAs(actor, {
          method: "DELETE",
          url: `/api/v1/assets/${ID.campaignSpell}?expectedVersion=1`,
        });
        expect(archive.statusCode).toBe(403);

        const restore = await injectAs(actor, {
          method: "POST",
          url: `/api/v1/assets/${ID.campaignSpell}/restore`,
          payload: { expectedVersion: 1 },
        });
        expect(restore.statusCode).toBe(403);
      }
    });
  });

  describe("request validation and authentication", () => {
    it("rejects invalid params and unauthenticated requests", async () => {
      const invalidType = await injectAs(GM, { method: "GET", url: "/api/v1/catalog/spell" });
      expect(invalidType.statusCode).toBe(400);

      const invalidId = await injectAs(GM, { method: "GET", url: "/api/v1/campaigns/nope/assets" });
      expect(invalidId.statusCode).toBe(400);

      const anonymous = await app.inject({ method: "GET", url: "/api/v1/catalog/SPELL" });
      expect(anonymous.statusCode).toBe(401);
    });

    it("checks authentication and permissions before validating the payload", async () => {
      const anonymous = await app.inject({
        method: "PATCH",
        url: `/api/v1/assets/${ID.campaignSpell}`,
        payload: { title: "" },
      });
      expect(anonymous.statusCode).toBe(401);

      const anonymousInvalidParam = await app.inject({ method: "GET", url: "/api/v1/catalog/spell" });
      expect(anonymousInvalidParam.statusCode).toBe(401);

      const withoutPermission = await injectAs(PLAYER, {
        method: "POST",
        url: `/api/v1/assets/${ID.campaignSpell}/restore`,
        payload: {},
      });
      expect(withoutPermission.statusCode).toBe(403);

      const permittedButInvalid = await injectAs(ADMIN, {
        method: "PATCH",
        url: `/api/v1/assets/${ID.campaignSpell}`,
        payload: { title: "" },
      });
      expect(permittedButInvalid.statusCode).toBe(400);
    });
  });

  describe("metadata management", () => {
    it("forbids users without the update permission", async () => {
      const response = await injectAs(GM, {
        method: "PATCH",
        url: `/api/v1/assets/${ID.campaignSpell}`,
        payload: { expectedVersion: 1, title: "Hijacked" },
      });

      expect(response.statusCode).toBe(403);
    });

    it("updates metadata with optimistic locking and validates payloads", async () => {
      const updated = await injectAs(ADMIN, {
        method: "PATCH",
        url: `/api/v1/assets/${ID.systemLight}`,
        payload: { expectedVersion: 1, title: "Light (revised)", rulesetPolicy: "RESTRICTED", rulesetIds: [ID.ruleset2024] },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({
        version: 2,
        title: "Light (revised)",
        rulesetPolicy: "RESTRICTED",
        rulesetIds: [ID.ruleset2024],
      });

      const stale = await injectAs(ADMIN, {
        method: "PATCH",
        url: `/api/v1/assets/${ID.systemLight}`,
        payload: { expectedVersion: 1, title: "Stale" },
      });
      expect(stale.statusCode).toBe(412);

      const empty = await injectAs(ADMIN, {
        method: "PATCH",
        url: `/api/v1/assets/${ID.systemLight}`,
        payload: { expectedVersion: 2 },
      });
      expect(empty.statusCode).toBe(400);

      const slugConflict = await injectAs(ADMIN, {
        method: "PATCH",
        url: `/api/v1/assets/${ID.campaignDraft}`,
        payload: { expectedVersion: 1, slug: "ember-lance" },
      });
      expect(slugConflict.statusCode).toBe(409);
    });

    it("archives and restores definitions; archived ones leave the catalog but stay resolvable", async () => {
      const archived = await injectAs(ADMIN, {
        method: "DELETE",
        url: `/api/v1/assets/${ID.campaignSpell}?expectedVersion=1`,
      });
      expect(archived.statusCode).toBe(200);
      expect(archived.json()).toMatchObject({ status: "ARCHIVED", version: 2 });

      const archiveAgain = await injectAs(ADMIN, {
        method: "DELETE",
        url: `/api/v1/assets/${ID.campaignSpell}?expectedVersion=2`,
      });
      expect(archiveAgain.statusCode).toBe(409);

      const catalog = await injectAs(GM, {
        method: "GET",
        url: `/api/v1/campaigns/${ID.campaignA}/catalog/SPELL`,
      });
      expect(titles(catalog.json())).not.toContain("Ember Lance");

      const detail = await injectAs(GM, { method: "GET", url: `/api/v1/assets/${ID.campaignSpell}` });
      expect(detail.json()).toMatchObject({ status: "ARCHIVED" });

      const restored = await injectAs(ADMIN, {
        method: "POST",
        url: `/api/v1/assets/${ID.campaignSpell}/restore`,
        payload: { expectedVersion: 2 },
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({ status: "ACTIVE", version: 3 });
    });
  });

  it("documents the asset routes in OpenAPI", async () => {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/documentation/json" });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/campaigns/{campaignId}/assets",
        "/api/v1/campaigns/{campaignId}/catalog/{assetType}",
        "/api/v1/assets/{assetId}",
        "/api/v1/assets/{assetId}/restore",
        "/api/v1/catalog/{assetType}",
      ]),
    );
  });
});
