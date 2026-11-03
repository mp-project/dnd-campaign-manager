import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
} from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import {
  type RulesetAggregate,
  RulesetRepository,
} from "#src/modules/ruleset/domain/repository/RulesetRepository";

export class RulesetService {
  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: RulesetRepository,
  ) {}

  /**
   * Loads a ruleset with its progressions; also used by other modules to check that it exists.
   */
  async getById(context: RequestContext, rulesetId: string): Promise<RulesetAggregate> {
    this.assertAuthenticated(context);

    const ruleset = await this.repository.findAggregateById(this.db, rulesetId);

    if (!ruleset) {
      throw new NotFoundError("Ruleset not found");
    }

    return ruleset;
  }

  async assertRulesetChangeRequiresMigration(input: {
    currentRulesetId: string;
    nextRulesetId: string;
  }): Promise<void> {
    if (input.currentRulesetId === input.nextRulesetId) {
      return;
    }

    throw new ConflictError("RULESET_CHANGE_REQUIRES_MIGRATION", {
      currentRulesetId: input.currentRulesetId,
      nextRulesetId: input.nextRulesetId,
    });
  }

  assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }
}
