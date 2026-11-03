import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestRulesetListQuerySchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { ListRulesetsUseCase } from "#src/modules/ruleset/useCase/ListRulesetsUseCase";

export class ListRulesetsController extends AbstractController {
  constructor(private readonly listRulesetsUseCase: ListRulesetsUseCase) {
    super();
  }

  handle = async (request: { query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestRulesetListQuerySchema.parse(request.query);

      return this.listRulesetsUseCase.execute(request.requestContext, query);
    });
}
