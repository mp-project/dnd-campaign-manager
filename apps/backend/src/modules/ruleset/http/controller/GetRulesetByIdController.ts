import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestRulesetParamsSchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { GetRulesetByIdUseCase } from "#src/modules/ruleset/useCase/GetRulesetByIdUseCase";
import { toRulesetResponse } from "#src/modules/ruleset/http/controller/RulesetResponseMapper";

export class GetRulesetByIdController extends AbstractController {
  constructor(private readonly getRulesetByIdUseCase: GetRulesetByIdUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestRulesetParamsSchema.parse(request.params);
      const ruleset = await this.getRulesetByIdUseCase.execute(
        request.requestContext,
        params.rulesetId,
      );

      return toRulesetResponse(ruleset);
    });
}
