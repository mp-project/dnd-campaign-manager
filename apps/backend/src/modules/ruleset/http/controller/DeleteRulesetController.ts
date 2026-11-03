import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestRulesetParamsSchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { DeleteRulesetUseCase } from "#src/modules/ruleset/useCase/DeleteRulesetUseCase";

export class DeleteRulesetController extends AbstractController {
  constructor(private readonly deleteRulesetUseCase: DeleteRulesetUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestRulesetParamsSchema.parse(request.params);

      await this.deleteRulesetUseCase.execute(request.requestContext, params.rulesetId);
    });
}
