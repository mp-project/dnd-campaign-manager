import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatureParamsSchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import { FeatureLifecycleCommandSchema } from "#src/modules/features/domain/dto/UpdateFeatureDto";
import type { DeleteFeatureUseCase } from "#src/modules/features/useCase/DeleteFeatureUseCase";

export class DeleteFeatureController extends AbstractController {
  constructor(private readonly useCase: DeleteFeatureUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, featureId } = RequestFeatureParamsSchema.parse(request.params);
      const command = FeatureLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        featureId,
        command,
      });
    });
}
