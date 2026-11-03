import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseRulesetDto,
  toRulesetResponse,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class GetRulesetByIdUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(context: RequestContext, rulesetId: string): Promise<ResponseRulesetDto> {
    return toRulesetResponse(await this.rulesetService.getById(context, rulesetId));
  }
}
