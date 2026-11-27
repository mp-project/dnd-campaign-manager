import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemFeatsQuerySchema } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { ListSystemFeatsUseCase } from "#src/modules/feats/useCase/ListSystemFeatsUseCase";

export class ListSystemFeatsController extends AbstractController {
  constructor(private readonly useCase: ListSystemFeatsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const query = RequestSystemFeatsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
