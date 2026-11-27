import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignItemsQuerySchema,
  RequestCampaignParamsSchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
import type { ListCampaignItemsUseCase } from "#src/modules/items/useCase/ListCampaignItemsUseCase";

export class ListCampaignItemsController extends AbstractController {
  constructor(private readonly useCase: ListCampaignItemsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestCampaignItemsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
