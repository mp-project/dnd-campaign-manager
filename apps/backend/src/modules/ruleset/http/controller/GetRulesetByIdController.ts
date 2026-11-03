import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestRulesetParamsSchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { GetRulesetByIdUseCase } from "#src/modules/ruleset/useCase/GetRulesetByIdUseCase";

export class GetRulesetByIdController extends AbstractController {
  constructor(private readonly getRulesetByIdUseCase: GetRulesetByIdUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestRulesetParamsSchema.parse(request.params);

      return this.getRulesetByIdUseCase.execute(request.requestContext, params.rulesetId);
    });
}
