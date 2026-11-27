import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignFeaturesParamsSchema,
  RequestFeatureCatalogQuerySchema,
} from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { ListFeatureCatalogUseCase } from "#src/modules/features/useCase/ListFeatureCatalogUseCase";

export class ListFeatureCatalogController extends AbstractController {
  constructor(private readonly useCase: ListFeatureCatalogUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignFeaturesParamsSchema.parse(request.params);
      const query = RequestFeatureCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
