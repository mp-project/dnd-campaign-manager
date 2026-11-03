import { NotFoundError, VersionConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class DeleteRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(context: RequestContext, rulesetId: string): Promise<void> {
    const { db, repository } = this.rulesetService;
    const actorId = this.rulesetService.assertAuthenticated(context);

    const current = await repository.findById(db, rulesetId);

    if (!current) {
      throw new NotFoundError("Ruleset not found");
    }

    const deleted = await repository.delete(db, {
      rulesetId,
      actorId,
      expectedVersion: current.version,
    });

    if (!deleted) {
      throw new VersionConflictError("Ruleset delete version mismatch");
    }
  }
}
