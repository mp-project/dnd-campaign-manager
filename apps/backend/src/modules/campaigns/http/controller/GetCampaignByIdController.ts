import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { toCampaignResponse } from "#src/modules/campaigns/http/controller/CampaignResponseMapper";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { GetCampaignByIdUseCase } from "#src/modules/campaigns/useCase/GetCampaignByIdUseCase";

export class GetCampaignByIdController extends AbstractController {
  constructor(
    private readonly getCampaignByIdUseCase: GetCampaignByIdUseCase,
    private readonly campaignUserService: CampaignUserService,
  ) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      await this.campaignUserService.requireUser(request.requestContext);
      const params = RequestCampaignParamsSchema.parse(request.params);
      const campaign = await this.getCampaignByIdUseCase.execute(
        request.requestContext,
        params.campaignId,
      );

      return toCampaignResponse(campaign);
    });
}
