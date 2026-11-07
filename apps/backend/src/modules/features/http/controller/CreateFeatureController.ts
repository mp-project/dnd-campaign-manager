import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateFeatureSchema } from "#src/modules/features/domain/dto/CreateFeatureDto";
import { RequestFeatureScopeParamsSchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { CreateFeatureUseCase } from "#src/modules/features/useCase/CreateFeatureUseCase";

export class CreateFeatureController extends AbstractController {
  constructor(private readonly useCase: CreateFeatureUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId } = RequestFeatureScopeParamsSchema.parse(request.params ?? {});
      const command = CreateFeatureSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        command,
      });
    });
}
