import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestTagsParamsSchema,
  RequestTagsQuerySchema,
} from "#src/modules/tags/domain/dto/RequestTagDto";
import { ListTagsUseCase } from "#src/modules/tags/useCase/ListTagsUseCase";

export class ListTagsController extends AbstractController {
  constructor(private readonly listTagsUseCase: ListTagsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestTagsParamsSchema.parse(request.params);
      const query = RequestTagsQuerySchema.parse(request.query);

      return this.listTagsUseCase.execute(request.requestContext, { ...params, query });
    });
}
