import type { RequestContext } from "#core/http/requestContext";
import type { RequestRulesetDto } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import type { RulesetAggregate } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class ListRulesetsUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(
    context: RequestContext,
    filters: RequestRulesetDto["query"],
  ): Promise<{ items: RulesetAggregate[]; total: number }> {
    return this.rulesetService.listActive(context, filters);
  }
}
