import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  EligibilityCheckSchema,
  RequestCampaignFeatParamsSchema,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { CheckFeatEligibilityUseCase } from "#src/modules/feats/useCase/CheckFeatEligibilityUseCase";

export class CheckFeatEligibilityController extends AbstractController {
  constructor(private readonly useCase: CheckFeatEligibilityUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignFeatParamsSchema.parse(request.params);
      const command = EligibilityCheckSchema.parse(request.body ?? {});

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
