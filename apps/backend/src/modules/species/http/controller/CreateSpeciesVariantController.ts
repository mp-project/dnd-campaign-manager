import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateSpeciesVariantSchema } from "#src/modules/species/domain/dto/CreateSpeciesDto";
import { RequestSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { CreateSpeciesVariantUseCase } from "#src/modules/species/useCase/CreateSpeciesVariantUseCase";

export class CreateSpeciesVariantController extends AbstractController {
  constructor(private readonly useCase: CreateSpeciesVariantUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, speciesId } = RequestSpeciesParamsSchema.parse(request.params);
      const command = CreateSpeciesVariantSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        speciesId,
        command,
      });
    });
}
