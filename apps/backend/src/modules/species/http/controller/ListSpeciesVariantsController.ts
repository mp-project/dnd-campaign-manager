import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ListSpeciesVariantsUseCase } from "#src/modules/species/useCase/ListSpeciesVariantsUseCase";

export class ListSpeciesVariantsController extends AbstractController {
  constructor(private readonly useCase: ListSpeciesVariantsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      return this.ok(await this.useCase.execute(request.requestContext, RequestSpeciesParamsSchema.parse(request.params)));
    });
}
