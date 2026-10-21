import Fastify from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";

import { createAppContainer } from "#core/app/container";
import { createDrizzleDb, createPgPool } from "#core/db/pool";
import {
  assetFamilies,
  assetRulesets,
  assets,
  campaigns,
  rulesets,
  users,
} from "#core/db/schema";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "#core/error/http/index";
import {
  ASSETS_MODULE_DEPENDENCIES,
  type AssetsModuleDependencies,
  assetsModule,
} from "#src/modules/assets/index";
import { authModule } from "#src/modules/auth/index";
import { campaignsModule } from "#src/modules/campaigns/index";
import { rulesetModule } from "#src/modules/ruleset/index";
import { systemModule } from "#src/modules/index";
import { usersModule } from "#src/modules/users/index";
import { registerModules } from "#core/app/moduleSystem";
import { createTestEnv } from "#test/helpers/testEnv";

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:55433/dnd_campaign_manager_test";

const ACTOR = "a1000000-0000-4000-8000-000000000001";
const RULESET_2014 = "11000000-0000-4000-8000-000000002014";
const RULESET_2024 = "11000000-0000-4000-8000-000000002024";
const CAMPAIGN_A = "c1000000-0000-4000-8000-00000000000a";
const CAMPAIGN_B = "c1000000-0000-4000-8000-00000000000b";
const FAMILY = "f1000000-0000-4000-8000-000000000001";

function findPgCode(error: unknown): string | undefined {
  let current: unknown = error;

  while (typeof current === "object" && current !== null) {
    const code = (current as { code?: unknown }).code;

    if (typeof code === "string") {
      return code;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return undefined;
}

async function pgCodeOf(query: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await query;
  } catch (error) {
    return findPgCode(error);
  }

  return undefined;
}

describe("assets service port and persistence", () => {
  const pool = createPgPool(TEST_DB_URL);
  const db = createDrizzleDb(pool);
  const container = createAppContainer({ config: createTestEnv(), pool });
  const app = Fastify();
  let deps: AssetsModuleDependencies;

  beforeAll(async () => {
    await registerModules(app, container, [
      systemModule,
      authModule,
      usersModule,
      rulesetModule,
      campaignsModule,
      assetsModule,
    ]);
    deps = container.dependencies.require<AssetsModuleDependencies>(ASSETS_MODULE_DEPENDENCIES);
  });

  beforeEach(async () => {
    await db.insert(rulesets).values(
      [RULESET_2014, RULESET_2024].map((id, index) => ({
        id,
        code: `DND_5E_IT_ASSET_PORT_${index}`,
        name: `Ruleset ${index}`,
        status: "ACTIVE" as const,
        editionYear: index === 0 ? 2014 : 2024,
        sourceReference: {},
        licenseCode: "TEST",
      })),
    );
    await db.insert(users).values({
      id: ACTOR,
      email: "asset-port@example.test",
      passwordHash: "hash",
      displayName: "GM",
      systemRole: "USER",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    });
    await db.insert(campaigns).values(
      [CAMPAIGN_A, CAMPAIGN_B].map((id, index) => ({
        id,
        ownerUserId: ACTOR,
        rulesetId: RULESET_2024,
        name: `Campaign ${index}`,
        slug: `campaign-${index}`,
        status: "ACTIVE" as const,
        createdBy: ACTOR,
      })),
    );
    await db.insert(assetFamilies).values({
      id: FAMILY,
      assetType: "SPELL",
      code: "fireball",
      name: "Fireball",
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function countAssets(): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(assets)
      .where(isNull(assets.deletedAt));

    return row?.total ?? 0;
  }

  it("creates restricted homebrew bound to the campaign ruleset", async () => {
    const record = await container.transactionManager.inTransaction((tx) =>
      deps.service.createBase(
        tx,
        { actorId: ACTOR, campaignId: CAMPAIGN_A },
        { assetType: "SPELL", title: "Ember Lance", rulesetPolicy: "RESTRICTED", status: "ACTIVE" },
      ),
    );

    expect(record.asset).toMatchObject({
      scope: "CAMPAIGN",
      origin: "CUSTOM",
      campaignId: CAMPAIGN_A,
      slug: "ember-lance",
      createdBy: ACTOR,
    });
    expect(record.rulesetIds).toEqual([RULESET_2024]);
  });

  it("rolls back the base asset when the domain transaction fails", async () => {
    await expect(
      container.transactionManager.inTransaction(async (tx) => {
        await deps.service.createBase(
          tx,
          { actorId: ACTOR, campaignId: CAMPAIGN_A },
          { assetType: "NPC", title: "Mira" },
        );

        throw new Error("domain insert failed");
      }),
    ).rejects.toThrow("domain insert failed");

    expect(await countAssets()).toBe(0);
  });

  it("rolls back restricted system assets without rulesets", async () => {
    await expect(
      container.transactionManager.inTransaction((tx) =>
        deps.service.createBase(
          tx,
          { actorId: ACTOR, campaignId: null },
          { assetType: "SPELL", title: "Fireball", rulesetPolicy: "RESTRICTED", rulesetIds: [] },
        ),
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await countAssets()).toBe(0);
  });

  it("enforces active slug uniqueness per campaign and type, released by soft delete", async () => {
    const create = (campaignId: string, assetType: "NPC" | "LOCATION" = "NPC") =>
      container.transactionManager.inTransaction((tx) =>
        deps.service.createBase(tx, { actorId: ACTOR, campaignId }, { assetType, title: "Mira" }),
      );

    const first = await create(CAMPAIGN_A);
    await expect(create(CAMPAIGN_A)).rejects.toBeInstanceOf(ConflictError);
    await expect(create(CAMPAIGN_B)).resolves.toBeDefined();
    await expect(create(CAMPAIGN_A, "LOCATION")).resolves.toBeDefined();

    await db.update(assets).set({ deletedAt: new Date() }).where(eq(assets.id, first.asset.id));
    await expect(create(CAMPAIGN_A)).resolves.toBeDefined();
  });

  it("enforces scope/origin/campaign checks and foreign keys in the database", async () => {
    const invalidScope = db.insert(assets).values({
      assetType: "SPELL",
      title: "Broken",
      slug: "broken",
      scope: "SYSTEM",
      origin: "DEFAULT",
      campaignId: CAMPAIGN_A,
    });
    expect(await pgCodeOf(invalidScope)).toBe("23514");

    const familyTypeMismatch = db.insert(assets).values({
      assetType: "ITEM",
      title: "Broken",
      slug: "broken",
      scope: "SYSTEM",
      origin: "DEFAULT",
      assetFamilyId: FAMILY,
    });
    expect(await pgCodeOf(familyTypeMismatch)).toBe("23503");

    const orphanRuleset = db.insert(assetRulesets).values({
      assetId: "e1000000-0000-4000-8000-000000000999",
      rulesetId: RULESET_2014,
    });
    expect(await pgCodeOf(orphanRuleset)).toBe("23503");
  });

  it("resolves family variants per ruleset and checks availability", async () => {
    const createVariant = (title: string, rulesetId: string) =>
      container.transactionManager.inTransaction((tx) =>
        deps.service.createBase(
          tx,
          { actorId: ACTOR, campaignId: null },
          {
            assetType: "SPELL",
            title,
            status: "ACTIVE",
            assetFamilyId: FAMILY,
            rulesetPolicy: "RESTRICTED",
            rulesetIds: [rulesetId],
          },
        ),
      );

    const fireball2014 = await createVariant("Fireball 2014", RULESET_2014);
    const fireball2024 = await createVariant("Fireball 2024", RULESET_2024);

    expect((await deps.service.resolveVariant({ assetFamilyId: FAMILY, rulesetId: RULESET_2014 }))
      ?.asset.id).toBe(fireball2014.asset.id);
    expect((await deps.service.resolveVariant({ assetFamilyId: FAMILY, rulesetId: RULESET_2024 }))
      ?.asset.id).toBe(fireball2024.asset.id);

    await expect(
      deps.service.assertAvailable({
        assetId: fireball2014.asset.id,
        campaignId: CAMPAIGN_A,
        rulesetId: RULESET_2024,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      deps.service.assertAvailable({
        assetId: fireball2024.asset.id,
        campaignId: CAMPAIGN_A,
        rulesetId: RULESET_2024,
      }),
    ).resolves.toMatchObject({ asset: { id: fireball2024.asset.id } });
  });

  it("rejects archived and cross-campaign assets for new selections but keeps them resolvable", async () => {
    const homebrew = await container.transactionManager.inTransaction((tx) =>
      deps.service.createBase(
        tx,
        { actorId: ACTOR, campaignId: CAMPAIGN_A },
        { assetType: "ITEM", title: "Lantern", status: "ACTIVE" },
      ),
    );

    await expect(
      deps.service.assertAvailable({
        assetId: homebrew.asset.id,
        campaignId: CAMPAIGN_B,
        rulesetId: RULESET_2024,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await container.transactionManager.inTransaction((tx) =>
      deps.service.archiveBase(tx, {
        actorId: ACTOR,
        assetId: homebrew.asset.id,
        expectedVersion: 1,
      }),
    );

    await expect(
      deps.service.assertAvailable({
        assetId: homebrew.asset.id,
        campaignId: CAMPAIGN_A,
        rulesetId: RULESET_2024,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect((await deps.service.get(homebrew.asset.id))?.asset.status).toBe("ARCHIVED");
  });

  it("syncs ruleset links when the ruleset policy changes", async () => {
    const homebrew = await container.transactionManager.inTransaction((tx) =>
      deps.service.createBase(
        tx,
        { actorId: ACTOR, campaignId: CAMPAIGN_A },
        { assetType: "FEAT", title: "Lucky" },
      ),
    );

    const restricted = await container.transactionManager.inTransaction((tx) =>
      deps.service.updateMetadata(tx, {
        actorId: ACTOR,
        assetId: homebrew.asset.id,
        expectedVersion: 1,
        patch: { rulesetPolicy: "RESTRICTED" },
      }),
    );
    expect(restricted.rulesetIds).toEqual([RULESET_2024]);

    const neutral = await container.transactionManager.inTransaction((tx) =>
      deps.service.updateMetadata(tx, {
        actorId: ACTOR,
        assetId: homebrew.asset.id,
        expectedVersion: 2,
        patch: { rulesetPolicy: "NEUTRAL" },
      }),
    );
    expect(neutral.rulesetIds).toEqual([]);

    const softDeletedLinks = await db
      .select({ id: assetRulesets.id })
      .from(assetRulesets)
      .where(and(eq(assetRulesets.assetId, homebrew.asset.id), sql`${assetRulesets.deletedAt} is not null`));
    expect(softDeletedLinks).toHaveLength(1);
  });
});
