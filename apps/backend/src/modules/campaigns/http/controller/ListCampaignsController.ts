import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestCampaignListQuerySchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { ListCampaignsUseCase } from "#src/modules/campaigns/useCase/ListCampaignsUseCase";

export class ListCampaignsController extends AbstractController {
  constructor(private readonly listCampaignsUseCase: ListCampaignsUseCase) {
    super();
  }

  handle = async (request: { query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestCampaignListQuerySchema.parse(request.query);

      return this.listCampaignsUseCase.execute(request.requestContext, query);
    });
}
