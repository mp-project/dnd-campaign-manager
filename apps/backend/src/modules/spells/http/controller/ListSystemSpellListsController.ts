import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemSpellListsQuerySchema } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { ListSystemSpellListsUseCase } from "#src/modules/spells/useCase/ListSystemSpellListsUseCase";

export class ListSystemSpellListsController extends AbstractController {
  constructor(private readonly useCase: ListSystemSpellListsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const query = RequestSystemSpellListsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
