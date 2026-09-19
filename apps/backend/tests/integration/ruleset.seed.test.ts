import { and, eq, isNull } from "drizzle-orm";

import { createDrizzleDb, createPgPool } from "#core/db/pool";
import { rulesetLevelProgressions, rulesets } from "#core/db/schema";
import { seedBootstrapState, seedRulesets } from "../../scripts/seed.js";

describe("ruleset seed", () => {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

  const pool = createPgPool(testDatabaseUrl);
  const db = createDrizzleDb(pool);

  afterAll(async () => {
    await pool.end();
  });

  it("is idempotent and creates exactly 20 levels per ruleset", async () => {
    const bootstrapCreatedFirst = await seedBootstrapState(db);
    const createdRulesetsFirst = await seedRulesets(db);

    const bootstrapCreatedSecond = await seedBootstrapState(db);
    const createdRulesetsSecond = await seedRulesets(db);

    expect(bootstrapCreatedFirst).toBe(true);
    expect(createdRulesetsFirst).toBe(2);
    expect(bootstrapCreatedSecond).toBe(false);
    expect(createdRulesetsSecond).toBe(0);

    const activeRulesets = await db
      .select({ id: rulesets.id, code: rulesets.code })
      .from(rulesets)
      .where(and(isNull(rulesets.deletedAt), eq(rulesets.status, "ACTIVE")));

    const codes = activeRulesets.map((item) => item.code).sort();

    expect(codes).toEqual(["DND_5E_2014", "DND_5E_2024"]);

    for (const ruleset of activeRulesets) {
      const levels = await db
        .select({ id: rulesetLevelProgressions.id })
        .from(rulesetLevelProgressions)
        .where(
          and(
            eq(rulesetLevelProgressions.rulesetId, ruleset.id),
            isNull(rulesetLevelProgressions.deletedAt),
          ),
        );

      expect(levels).toHaveLength(20);
    }
  });
});
