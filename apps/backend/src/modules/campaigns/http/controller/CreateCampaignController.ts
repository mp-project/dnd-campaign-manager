import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateCampaignSchema } from "#src/modules/campaigns/domain/dto/CreateCampaignDto";
import { CreateCampaignUseCase } from "#src/modules/campaigns/useCase/CreateCampaignUseCase";

export class CreateCampaignController extends AbstractController {
  constructor(private readonly createCampaignUseCase: CreateCampaignUseCase) {
    super();
  }

  handle = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const body = CreateCampaignSchema.parse(request.body);

      return this.createCampaignUseCase.execute(request.requestContext, body);
    });
}
