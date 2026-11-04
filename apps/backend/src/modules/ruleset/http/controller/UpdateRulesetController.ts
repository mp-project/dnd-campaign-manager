import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestRulesetParamsSchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { UpdateRulesetSchema } from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import { UpdateRulesetUseCase } from "#src/modules/ruleset/useCase/UpdateRulesetUseCase";

export class UpdateRulesetController extends AbstractController {
  constructor(private readonly updateRulesetUseCase: UpdateRulesetUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestRulesetParamsSchema.parse(request.params);
      const body = UpdateRulesetSchema.parse(request.body);

      return this.updateRulesetUseCase.execute(request.requestContext, {
        rulesetId: params.rulesetId,
        command: body,
      });
    });
}
