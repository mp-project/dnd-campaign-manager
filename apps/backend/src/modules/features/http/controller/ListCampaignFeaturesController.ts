import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignFeaturesParamsSchema,
  RequestCampaignFeaturesQuerySchema,
} from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { ListCampaignFeaturesUseCase } from "#src/modules/features/useCase/ListCampaignFeaturesUseCase";

export class ListCampaignFeaturesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignFeaturesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignFeaturesParamsSchema.parse(request.params);
      const query = RequestCampaignFeaturesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
