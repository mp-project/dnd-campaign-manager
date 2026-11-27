import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemItemsQuerySchema } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ListSystemItemsUseCase } from "#src/modules/items/useCase/ListSystemItemsUseCase";

export class ListSystemItemsController extends AbstractController {
  constructor(private readonly useCase: ListSystemItemsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const query = RequestSystemItemsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
