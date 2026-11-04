import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestHistoryEntityParamsSchema, RequestHistoryListQuerySchema } from "#src/modules/history/domain/dto/RequestHistoryDto";
import { ListHistoryUseCase } from "#src/modules/history/useCase/ListHistoryUseCase";

export class ListHistoryController extends AbstractController {
  constructor(private readonly useCase: ListHistoryUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestHistoryEntityParamsSchema.parse(request.params);
      const query = RequestHistoryListQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        ...params,
        limit: query.limit,
        includeChildren: query.includeChildren,
        ...(query.field ? { field: query.field } : {}),
        ...(query.before !== undefined ? { before: query.before } : {}),
      });
    });
}
