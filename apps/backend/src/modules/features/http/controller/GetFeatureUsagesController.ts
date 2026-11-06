import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignFeatureParamsSchema } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { GetFeatureUsagesUseCase } from "#src/modules/features/useCase/GetFeatureUsagesUseCase";

export class GetFeatureUsagesController extends AbstractController {
  constructor(private readonly useCase: GetFeatureUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () =>
      this.useCase.execute(
        request.requestContext,
        RequestCampaignFeatureParamsSchema.parse(request.params),
      ),
    );
}
