import type { RequestContext } from "#core/http/requestContext";
import {
  type UpdateRulesetDto,
  UpdateRulesetSchema,
} from "#src/modules/ruleset/domain/dto/UpdateRulesetDto";
import { RequestRulesetParamsSchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { UpdateRulesetUseCase } from "#src/modules/ruleset/useCase/UpdateRulesetUseCase";
import { toRulesetResponse } from "#src/modules/ruleset/http/controller/RulesetResponseMapper";

export class UpdateRulesetController {
  constructor(private readonly updateRulesetUseCase: UpdateRulesetUseCase) {}

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) => {
    const params = RequestRulesetParamsSchema.parse(request.params);
    const body: UpdateRulesetDto = UpdateRulesetSchema.parse(request.body);

    const updated = await this.updateRulesetUseCase.execute(
      request.requestContext,
      params.rulesetId,
      body,
    );

    return toRulesetResponse(updated);
  };
}
