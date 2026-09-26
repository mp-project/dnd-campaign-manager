import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestRulesetParamsSchema } from "#src/modules/ruleset/domain/dto/RequestRulesetDto";
import { ValidateRulesetUseCase } from "#src/modules/ruleset/useCase/ValidateRulesetUseCase";

export class ValidateRulesetController extends AbstractController {
  constructor(private readonly validateRulesetUseCase: ValidateRulesetUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestRulesetParamsSchema.parse(request.params);
      const compatible = await this.validateRulesetUseCase.execute(
        request.requestContext,
        params.rulesetId,
      );

      return {
        status: "ok" as const,
        rulesetId: params.rulesetId,
        compatible,
      };
    });
}
