import type { RequestContext } from "#core/http/requestContext";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class DeleteRulesetUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(context: RequestContext, rulesetId: string): Promise<void> {
    await this.rulesetService.softDelete(context, rulesetId);
  }
}
