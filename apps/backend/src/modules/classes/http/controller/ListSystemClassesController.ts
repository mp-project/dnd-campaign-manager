import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemClassesQuerySchema } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { ListSystemClassesUseCase } from "#src/modules/classes/useCase/ListSystemClassesUseCase";

export class ListSystemClassesController extends AbstractController {
  constructor(private readonly useCase: ListSystemClassesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestSystemClassesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
