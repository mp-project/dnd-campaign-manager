import { createStandardListResponse } from "#core/http/listResponse";
import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestRulesetListQuerySchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { ListRulesetsUseCase } from "#src/modules/ruleset/useCase/ListRulesetsUseCase";
import { toRulesetResponse } from "#src/modules/ruleset/http/controller/RulesetResponseMapper";

export class ListRulesetsController extends AbstractController {
  constructor(private readonly listRulesetsUseCase: ListRulesetsUseCase) {
    super();
  }

  handle = async (request: { query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestRulesetListQuerySchema.parse(request.query);
      const result = await this.listRulesetsUseCase.execute(request.requestContext, query);

      return createStandardListResponse({
        data: result.items.map(toRulesetResponse),
        limit: query.limit,
        nextCursor: null,
        total: result.total,
      });
    });
}
