import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestFeatureParamsSchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import { FeatureLifecycleCommandSchema } from "#src/modules/features/domain/dto/UpdateFeatureDto";
import type { RestoreFeatureUseCase } from "#src/modules/features/useCase/RestoreFeatureUseCase";

export class RestoreFeatureController extends AbstractController {
  constructor(private readonly useCase: RestoreFeatureUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, featureId } = RequestFeatureParamsSchema.parse(request.params);
      const command = FeatureLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        featureId,
        command,
      });
    });
}
