import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestCampaignCatalogParamsSchema,
  RequestCampaignCatalogQuerySchema,
} from "#src/modules/assets/domain/dto/RequestAssetDto";
import { ListCampaignCatalogUseCase } from "#src/modules/assets/useCase/ListCampaignCatalogUseCase";

export class ListCampaignCatalogController extends AbstractController {
  constructor(private readonly listCampaignCatalogUseCase: ListCampaignCatalogUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignCatalogParamsSchema.parse(request.params);
      const query = RequestCampaignCatalogQuerySchema.parse(request.query);

      return this.listCampaignCatalogUseCase.execute(
        request.requestContext,
        params.campaignId,
        params.assetType,
        query,
      );
    });
}
