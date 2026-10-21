import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestCampaignAssetsParamsSchema,
  RequestCampaignAssetsQuerySchema,
} from "#src/modules/assets/domain/dto/RequestAssetDto";
import { ListCampaignAssetsUseCase } from "#src/modules/assets/useCase/ListCampaignAssetsUseCase";

export class ListCampaignAssetsController extends AbstractController {
  constructor(private readonly listCampaignAssetsUseCase: ListCampaignAssetsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignAssetsParamsSchema.parse(request.params);
      const query = RequestCampaignAssetsQuerySchema.parse(request.query);

      return this.listCampaignAssetsUseCase.execute(
        request.requestContext,
        params.campaignId,
        query,
      );
    });
}
