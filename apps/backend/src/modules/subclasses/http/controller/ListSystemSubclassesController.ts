import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemSubclassesQuerySchema } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { ListSystemSubclassesUseCase } from "#src/modules/subclasses/useCase/ListSystemSubclassesUseCase";

export class ListSystemSubclassesController extends AbstractController {
  constructor(private readonly useCase: ListSystemSubclassesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestSystemSubclassesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
