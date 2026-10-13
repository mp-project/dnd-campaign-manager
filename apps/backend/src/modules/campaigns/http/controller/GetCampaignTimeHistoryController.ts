import { createStandardListResponse } from "#core/http/listResponse";
import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestCampaignParamsSchema,
  RequestCampaignTimeHistoryQuerySchema,
} from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { toCampaignTimeEventResponse } from "#src/modules/campaigns/http/controller/CampaignResponseMapper";
import { GetCampaignTimeHistoryUseCase } from "#src/modules/campaigns/useCase/GetCampaignTimeHistoryUseCase";

export class GetCampaignTimeHistoryController extends AbstractController {
  constructor(
    private readonly getCampaignTimeHistoryUseCase: GetCampaignTimeHistoryUseCase,
    private readonly campaignUserService: CampaignUserService,
  ) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      await this.campaignUserService.requireUser(request.requestContext);
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestCampaignTimeHistoryQuerySchema.parse(request.query);
      const events = await this.getCampaignTimeHistoryUseCase.execute(
        request.requestContext,
        params.campaignId,
        query.limit,
      );

      return createStandardListResponse({
        data: events.map(toCampaignTimeEventResponse),
        limit: query.limit,
        nextCursor: null,
      });
    });
}
