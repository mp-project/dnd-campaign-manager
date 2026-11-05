import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestContentSharesParamsSchema,
  RequestContentSharesQuerySchema,
} from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import { ListContentSharesUseCase } from "#src/modules/content-shares/useCase/ListContentSharesUseCase";

export class ListContentSharesController extends AbstractController {
  constructor(private readonly listContentSharesUseCase: ListContentSharesUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestContentSharesParamsSchema.parse(request.params);
      const query = RequestContentSharesQuerySchema.parse(request.query);

      return this.listContentSharesUseCase.execute(request.requestContext, { ...params, query });
    });
}
