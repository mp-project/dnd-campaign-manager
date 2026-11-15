import { and, eq, isNull } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { rulesetLevelProgressions, rulesets, rulesetSpellSlotProgressions } from "#core/db/schema";
import { buildTestApp } from "#test/helpers/buildTestApp";

import { ensureDefaultRulesets, seedBootstrapState } from "../../scripts/seed.js";

/**
 * The default rulesets exist without a manual step: the seed script and the app's start create
 * them once per version, and a deleted default doesn't come back.
 */
describe("default rulesets", () => {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

  const pool = createPgPool(testDatabaseUrl);
  const db = createDrizzleDb(pool);

  afterAll(async () => {
    await pool.end();
  });

  async function activeCodes(): Promise<string[]> {
    const rows = await db
      .select({ code: rulesets.code })
      .from(rulesets)
      .where(and(isNull(rulesets.deletedAt), eq(rulesets.status, "ACTIVE")));
    return rows.map((row) => row.code).sort();
  }

  it("is idempotent and creates 20 levels and the spell slots per ruleset", async () => {
    expect(await seedBootstrapState(db)).toBe(true);
    expect(await ensureDefaultRulesets(db)).toBe(2);
    expect(await seedBootstrapState(db)).toBe(false);
    expect(await ensureDefaultRulesets(db)).toBe(0);

    expect(await activeCodes()).toEqual(["DND_5E_2014", "DND_5E_2024"]);

    for (const ruleset of await db.select({ id: rulesets.id }).from(rulesets)) {
      const levels = await db
        .select({ id: rulesetLevelProgressions.id })
        .from(rulesetLevelProgressions)
        .where(eq(rulesetLevelProgressions.rulesetId, ruleset.id));
      const slots = await db
        .select({ id: rulesetSpellSlotProgressions.id })
        .from(rulesetSpellSlotProgressions)
        .where(eq(rulesetSpellSlotProgressions.rulesetId, ruleset.id));

      expect(levels).toHaveLength(20);
      expect(slots).toHaveLength(20 * 9);
    }
  });

  it("doesn't bring back a default ruleset somebody deleted", async () => {
    await ensureDefaultRulesets(db);
    await db.update(rulesets).set({ deletedAt: new Date() }).where(eq(rulesets.code, "DND_5E_2014"));

    expect(await ensureDefaultRulesets(db)).toBe(0);
    expect(await activeCodes()).toEqual(["DND_5E_2024"]);
  });

  it("are created when the app starts, so a campaign can be created right away", async () => {
    const { app } = buildTestApp({ env: { DEFAULT_RULESETS_ON_START: true } });
    await app.ready();

    expect(await activeCodes()).toEqual(["DND_5E_2014", "DND_5E_2024"]);
    await app.close();
  });
});
