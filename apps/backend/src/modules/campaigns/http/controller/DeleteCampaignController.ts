import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { DeleteCampaignUseCase } from "#src/modules/campaigns/useCase/DeleteCampaignUseCase";

export class DeleteCampaignController extends AbstractController {
  constructor(private readonly deleteCampaignUseCase: DeleteCampaignUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);

      await this.deleteCampaignUseCase.execute(request.requestContext, params.campaignId);
    });
}
