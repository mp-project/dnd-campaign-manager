import { ConflictError, ForbiddenError } from "#core/error/http/index";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";
import type { RulesetRepository } from "#src/modules/ruleset/domain/repository/RulesetRepository";

function buildLevelProgressions() {
  return Array.from({ length: 20 }, (_, index) => ({
    characterLevel: index + 1,
    proficiencyBonus: Math.floor(index / 4) + 2,
    experienceThreshold: index * 100,
  }));
}

describe("RulesetService", () => {
  it("rejects create for non-admin actors", async () => {
    const repository = {} as RulesetRepository;
    const tx: TransactionManager = {
      inTransaction: async (work) => work({} as AppDatabase),
    };
    const service = new RulesetService({} as AppDatabase, tx, repository);

    await expect(
      service.create(
        {
          actorId: "user-1",
          systemRole: "USER",
        },
        {
          code: "DND_5E_3000",
          name: "Test",
          description: null,
          editionYear: 3000,
          sourceReference: {},
          licenseCode: "TEST",
          attribution: null,
          levelProgressions: buildLevelProgressions(),
          spellSlotProgressions: [{ casterLevel: 1, slotLevel: 1, slotCount: 2 }],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

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
