import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatureParamsSchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import { UpdateFeatureSchema } from "#src/modules/features/domain/dto/UpdateFeatureDto";
import type { UpdateFeatureUseCase } from "#src/modules/features/useCase/UpdateFeatureUseCase";

export class UpdateFeatureController extends AbstractController {
  constructor(private readonly useCase: UpdateFeatureUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, featureId } = RequestFeatureParamsSchema.parse(request.params);
      const command = UpdateFeatureSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        featureId,
        command,
      });
    });
}
