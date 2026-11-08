import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ValidateSpeciesUseCase } from "#src/modules/species/useCase/ValidateSpeciesUseCase";

export class ValidateSpeciesController extends AbstractController {
  constructor(private readonly useCase: ValidateSpeciesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, speciesId } = RequestSpeciesParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, speciesId });
    });
}
