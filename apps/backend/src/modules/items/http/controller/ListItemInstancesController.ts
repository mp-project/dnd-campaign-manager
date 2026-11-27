import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignParamsSchema,
  RequestItemInstancesQuerySchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
import type { ListItemInstancesUseCase } from "#src/modules/items/useCase/ListItemInstancesUseCase";

export class ListItemInstancesController extends AbstractController {
  constructor(private readonly useCase: ListItemInstancesUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const query = RequestItemInstancesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
