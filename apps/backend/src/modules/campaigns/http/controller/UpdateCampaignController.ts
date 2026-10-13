import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  type UpdateCampaignDto,
  UpdateCampaignSchema,
} from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { toCampaignResponse } from "#src/modules/campaigns/http/controller/CampaignResponseMapper";
import { CampaignUserService } from "#src/modules/campaigns/service/CampaignUserService";
import { UpdateCampaignUseCase } from "#src/modules/campaigns/useCase/UpdateCampaignUseCase";

export class UpdateCampaignController extends AbstractController {
  constructor(
    private readonly updateCampaignUseCase: UpdateCampaignUseCase,
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
      const body: UpdateCampaignDto = UpdateCampaignSchema.parse(request.body);

      const updated = await this.updateCampaignUseCase.execute(
        request.requestContext,
        params.campaignId,
        body,
      );

      return toCampaignResponse(updated);
    });
}
