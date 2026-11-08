import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesVariantParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { GetSpeciesVariantUseCase } from "#src/modules/species/useCase/SpeciesVariantsReadUseCase";

export class GetSpeciesVariantController extends AbstractController {
  constructor(private readonly useCase: GetSpeciesVariantUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      return this.useCase.execute(
        request.requestContext,
        RequestSpeciesVariantParamsSchema.parse(request.params),
      );
    });
}
