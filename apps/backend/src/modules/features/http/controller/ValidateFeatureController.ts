import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatureParamsSchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { ValidateFeatureUseCase } from "#src/modules/features/useCase/ValidateFeatureUseCase";

export class ValidateFeatureController extends AbstractController {
  constructor(private readonly useCase: ValidateFeatureUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, featureId } = RequestFeatureParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        featureId,
      });
    });
}
