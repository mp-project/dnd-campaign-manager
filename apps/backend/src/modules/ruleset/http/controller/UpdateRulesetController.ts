import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  type UpdateRulesetDto,
  UpdateRulesetSchema,
} from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import { RequestRulesetParamsSchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { UpdateRulesetUseCase } from "#src/modules/ruleset/useCase/UpdateRulesetUseCase";
import { toRulesetResponse } from "#src/modules/ruleset/http/controller/RulesetResponseMapper";

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
      const body: UpdateRulesetDto = UpdateRulesetSchema.parse(request.body);

      const updated = await this.updateRulesetUseCase.execute(
        request.requestContext,
        params.rulesetId,
        body,
      );

      return toRulesetResponse(updated);
    });
}
