import { and, eq, isNull } from "drizzle-orm";

import {
  createDrizzleDb,
  createPgPool,
  createTransactionManager,
} from "#core/db/pool";
import { rulesets } from "#core/db/schema";
import { RulesetRepository } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

function buildLevelProgressions() {
  return Array.from({ length: 20 }, (_, index) => ({
    characterLevel: index + 1,
    proficiencyBonus: Math.floor(index / 4) + 2,
    experienceThreshold: index * 1000,
  }));
}

describe("ruleset service transactions", () => {
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:55432/dnd_campaign_manager_test";

  const pool = createPgPool(testDatabaseUrl);
  const db = createDrizzleDb(pool);
  const transactionManager = createTransactionManager(db);
  const repository = new RulesetRepository();
  const service = new RulesetService(db, transactionManager, repository);

  afterAll(async () => {
    await pool.end();
  });

  it("rolls back ruleset insert when progression insert fails", async () => {
    await expect(
      service.create(
        {
          actorId: "admin-rollback",
          systemRole: "ADMIN",
        },
        {
          code: "DND_5E_TX_ROLLBACK",
          name: "Rollback Ruleset",
          description: null,
          editionYear: 2024,
          sourceReference: { source: "integration" },
          licenseCode: "ROLLBACK",
          attribution: null,
          levelProgressions: buildLevelProgressions(),
          spellSlotProgressions: [
            { casterLevel: 1, slotLevel: 1, slotCount: 2 },
            { casterLevel: 1, slotLevel: 1, slotCount: 3 },
          ],
        },
      ),
    ).rejects.toThrow();

    const rows = await db
      .select()
      .from(rulesets)
      .where(
        and(
          eq(rulesets.code, "DND_5E_TX_ROLLBACK"),
          isNull(rulesets.deletedAt),
        ),
      );

    expect(rows).toHaveLength(0);
  });
});
