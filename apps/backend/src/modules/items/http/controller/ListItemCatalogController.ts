import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignParamsSchema,
  RequestItemCatalogQuerySchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
import type { ListItemCatalogUseCase } from "#src/modules/items/useCase/ListItemCatalogUseCase";

export class ListItemCatalogController extends AbstractController {
  constructor(private readonly useCase: ListItemCatalogUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestItemCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
