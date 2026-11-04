import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { UpdateCampaignSchema } from "#src/modules/campaigns/domain/dto/UpdateCampaignDto";
import { UpdateCampaignUseCase } from "#src/modules/campaigns/useCase/UpdateCampaignUseCase";

export class UpdateCampaignController extends AbstractController {
  constructor(private readonly updateCampaignUseCase: UpdateCampaignUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const body = UpdateCampaignSchema.parse(request.body);

      return this.updateCampaignUseCase.execute(request.requestContext, {
        campaignId: params.campaignId,
        command: body,
      });
    });
}
