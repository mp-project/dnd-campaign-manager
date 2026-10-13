import { createStandardListResponse } from "#core/http/listResponse";
import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestCampaignListQuerySchema } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import { toCampaignResponse } from "#src/modules/campaigns/http/controller/CampaignResponseMapper";
import { ListCampaignsUseCase } from "#src/modules/campaigns/useCase/ListCampaignsUseCase";

export class ListCampaignsController extends AbstractController {
  constructor(private readonly listCampaignsUseCase: ListCampaignsUseCase) {
    super();
  }

  handle = async (request: { query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestCampaignListQuerySchema.parse(request.query);
      const result = await this.listCampaignsUseCase.execute(request.requestContext, query);

      return createStandardListResponse({
        data: result.items.map(toCampaignResponse),
        limit: query.limit,
        nextCursor: null,
        total: result.total,
      });
    });
}
