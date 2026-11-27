import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSystemSpeciesQuerySchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ListSystemSpeciesUseCase } from "#src/modules/species/useCase/ListSystemSpeciesUseCase";

export class ListSystemSpeciesController extends AbstractController {
  constructor(private readonly useCase: ListSystemSpeciesUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const query = RequestSystemSpeciesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
