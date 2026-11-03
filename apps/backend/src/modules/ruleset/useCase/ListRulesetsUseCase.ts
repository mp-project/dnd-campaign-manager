import type { RequestContext } from "#core/http/requestContext";
import type { RequestRulesetDto } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import {
  type ResponseRulesetListDto,
  toRulesetListResponse,
} from "#src/modules/ruleset/domain/dto/ResponseRulesetDto";
import { RulesetService } from "#src/modules/ruleset/service/RulesetService";

export class ListRulesetsUseCase {
  constructor(private readonly rulesetService: RulesetService) {}

  async execute(
    context: RequestContext,
    filters: RequestRulesetDto["query"],
  ): Promise<ResponseRulesetListDto> {
    const { db, repository } = this.rulesetService;
    this.rulesetService.assertAuthenticated(context);

    const [items, total] = await Promise.all([
      repository.listAggregates(db, filters),
      repository.countAggregates(db, filters),
    ]);

    return toRulesetListResponse(items, filters.limit, total);
  }
}
