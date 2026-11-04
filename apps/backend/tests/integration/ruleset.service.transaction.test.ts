import { and, eq, isNull } from "drizzle-orm";

import {
  createDrizzleDb,
  createPgPool,
  createTransactionManager,
} from "#core/db/pool";
import { entityChangeEvents, rulesets } from "#core/db/schema";
import { HistoryRepository } from "#src/modules/history/domain/repository/HistoryRepository";
import { HistoryService } from "#src/modules/history/service/HistoryService";
import { trackedRuleset } from "#src/modules/ruleset/history/TrackedRuleset";
import { RulesetRepository } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";
import { CreateRulesetUseCase } from "#src/modules/ruleset/useCase/CreateRulesetUseCase";

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
  const history = new HistoryService(db, transactionManager, new HistoryRepository(), {
    error: () => undefined,
  });

  history.register(trackedRuleset);

  const useCase = new CreateRulesetUseCase(
    history,
    new RulesetService(db, transactionManager, repository),
  );

  afterAll(async () => {
    await pool.end();
  });

  it("rolls back the ruleset and its history when a progression insert fails", async () => {
    await expect(
      useCase.execute(
        {
          actorId: "a0000000-0000-4000-8000-000000000001",
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
    expect(await db.select().from(entityChangeEvents)).toHaveLength(0);
  });
});
