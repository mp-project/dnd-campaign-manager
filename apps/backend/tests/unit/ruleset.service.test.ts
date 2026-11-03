import { ConflictError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";
import type { RulesetRepository } from "#src/modules/ruleset/domain/repository/RulesetRepository";

describe("RulesetService", () => {
  it("throws RULESET_CHANGE_REQUIRES_MIGRATION when ruleset changes", async () => {
    const repository = {} as RulesetRepository;
    const tx: TransactionManager = {
      inTransaction: async (work) => work({} as AppDatabase),
    };
    const service = new RulesetService({} as AppDatabase, tx, repository);

    await expect(
      service.assertRulesetChangeRequiresMigration({
        currentRulesetId: "11111111-1111-4111-8111-111111111111",
        nextRulesetId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows unchanged ruleset id", async () => {
    const repository = {} as RulesetRepository;
    const tx: TransactionManager = {
      inTransaction: async (work) => work({} as AppDatabase),
    };
    const service = new RulesetService({} as AppDatabase, tx, repository);

    await expect(
      service.assertRulesetChangeRequiresMigration({
        currentRulesetId: "11111111-1111-4111-8111-111111111111",
        nextRulesetId: "11111111-1111-4111-8111-111111111111",
      }),
    ).resolves.toBeUndefined();
  });
});
