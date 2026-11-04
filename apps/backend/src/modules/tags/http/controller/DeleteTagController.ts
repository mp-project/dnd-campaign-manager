import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestDeleteTagQuerySchema,
  RequestTagItemParamsSchema,
} from "#src/modules/tags/domain/dto/RequestTagDto";
import { DeleteTagUseCase } from "#src/modules/tags/useCase/DeleteTagUseCase";

export class DeleteTagController extends AbstractController {
  constructor(private readonly deleteTagUseCase: DeleteTagUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestTagItemParamsSchema.parse(request.params);
      const query = RequestDeleteTagQuerySchema.parse(request.query);

      return this.deleteTagUseCase.execute(request.requestContext, { ...params, ...query });
    });
}
