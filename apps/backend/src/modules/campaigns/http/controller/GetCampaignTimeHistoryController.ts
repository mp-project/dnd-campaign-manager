import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestCampaignParamsSchema,
  RequestCampaignTimeHistoryQuerySchema,
} from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { GetCampaignTimeHistoryUseCase } from "#src/modules/campaigns/useCase/GetCampaignTimeHistoryUseCase";

export class GetCampaignTimeHistoryController extends AbstractController {
  constructor(private readonly getCampaignTimeHistoryUseCase: GetCampaignTimeHistoryUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestCampaignTimeHistoryQuerySchema.parse(request.query);

      return this.getCampaignTimeHistoryUseCase.execute(
        request.requestContext,
        params.campaignId,
        query.limit,
      );
    });
}
