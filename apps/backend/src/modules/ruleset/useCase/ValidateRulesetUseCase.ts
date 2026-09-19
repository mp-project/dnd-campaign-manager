import type { RequestContext } from "#core/http/requestContext";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class ValidateRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(context: RequestContext, rulesetId: string): Promise<boolean> {
    return this.rulesetService.validate(context, rulesetId);
  }
}
