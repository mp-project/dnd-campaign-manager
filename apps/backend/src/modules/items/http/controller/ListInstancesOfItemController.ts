import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignItemParamsSchema,
  RequestItemInstancesQuerySchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
import type { ListInstancesOfItemUseCase } from "#src/modules/items/useCase/ListInstancesOfItemUseCase";

/** The instance filters apply, except `itemAssetId`, which is the item of the path. */
export class ListInstancesOfItemController extends AbstractController {
  constructor(private readonly useCase: ListInstancesOfItemUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignItemParamsSchema.parse(request.params);
      const query = RequestItemInstancesQuerySchema.omit({ itemAssetId: true }).parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
