import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { AdvanceCampaignTimeSchema } from "#src/modules/campaigns/domain/dto/AdvanceCampaignTimeDto";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { toCampaignResponse } from "#src/modules/campaigns/http/controller/CampaignResponseMapper";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { AdvanceCampaignTimeUseCase } from "#src/modules/campaigns/useCase/AdvanceCampaignTimeUseCase";

export class AdvanceCampaignTimeController extends AbstractController {
  constructor(
    private readonly advanceCampaignTimeUseCase: AdvanceCampaignTimeUseCase,
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
      const body = AdvanceCampaignTimeSchema.parse(request.body);
      const updated = await this.advanceCampaignTimeUseCase.execute(
        request.requestContext,
        params.campaignId,
        body,
      );

      return toCampaignResponse(updated);
    });
}
