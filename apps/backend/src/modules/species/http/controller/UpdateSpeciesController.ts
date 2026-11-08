import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import { UpdateSpeciesSchema } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import type { UpdateSpeciesUseCase } from "#src/modules/species/useCase/UpdateSpeciesUseCase";

export class UpdateSpeciesController extends AbstractController {
  constructor(private readonly useCase: UpdateSpeciesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, speciesId } = RequestSpeciesParamsSchema.parse(request.params);
      const command = UpdateSpeciesSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        speciesId,
        command,
      });
    });
}
