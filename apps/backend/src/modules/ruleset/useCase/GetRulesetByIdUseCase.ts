import type { RequestContext } from "#core/http/requestContext";
import type { RulesetAggregate } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class GetRulesetByIdUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(context: RequestContext, rulesetId: string): Promise<RulesetAggregate> {
    return this.rulesetService.getById(context, rulesetId);
  }
}
