import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesVariantParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ValidateSpeciesVariantUseCase } from "#src/modules/species/useCase/ValidateSpeciesUseCase";

export class ValidateSpeciesVariantController extends AbstractController {
  constructor(private readonly useCase: ValidateSpeciesVariantUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, ...path } = RequestSpeciesVariantParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, ...path });
    });
}
