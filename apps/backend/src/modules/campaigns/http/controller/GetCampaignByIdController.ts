import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestCampaignParamsSchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { GetCampaignByIdUseCase } from "#src/modules/campaigns/useCase/GetCampaignByIdUseCase";

export class GetCampaignByIdController extends AbstractController {
  constructor(private readonly getCampaignByIdUseCase: GetCampaignByIdUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);

      return this.getCampaignByIdUseCase.execute(request.requestContext, params.campaignId);
    });
}
