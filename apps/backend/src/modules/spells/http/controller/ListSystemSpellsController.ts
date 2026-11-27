import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemSpellsQuerySchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ListSystemSpellsUseCase } from "#src/modules/spells/useCase/ListSystemSpellsUseCase";

export class ListSystemSpellsController extends AbstractController {
  constructor(private readonly useCase: ListSystemSpellsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const query = RequestSystemSpellsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
