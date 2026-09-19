import type { RequestContext } from "#core/http/requestContext";
import type { UpdateRulesetDto } from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import type { RulesetAggregate } from "#src/modules/ruleset/domain/repository/RulesetRepository";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class UpdateRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(
    context: RequestContext,
    rulesetId: string,
    input: UpdateRulesetDto,
  ): Promise<RulesetAggregate> {
    return this.rulesetService.update(context, rulesetId, input);
  }
}
