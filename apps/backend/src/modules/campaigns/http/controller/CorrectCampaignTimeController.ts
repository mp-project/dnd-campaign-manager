import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CorrectCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/CorrectCampaignTimeDto";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { toCampaignResponse } from "#src/modules/campaigns/http/controller/CampaignResponseMapper";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { CorrectCampaignTimeUseCase } from "#src/modules/campaigns/useCase/CorrectCampaignTimeUseCase";

export class CorrectCampaignTimeController extends AbstractController {
  constructor(
    private readonly correctCampaignTimeUseCase: CorrectCampaignTimeUseCase,
    private readonly campaignUserService: CampaignUserService,
  ) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      await this.campaignUserService.requireUser(request.requestContext);
      const params = RequestCampaignParamsSchema.parse(request.params);
      const body = CorrectCampaignTimeSchema.parse(request.body);
      const updated = await this.correctCampaignTimeUseCase.execute(
        request.requestContext,
        params.campaignId,
        body,
      );

      return toCampaignResponse(updated);
    });
}
