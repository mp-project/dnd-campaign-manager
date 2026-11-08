import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import { SpeciesLifecycleCommandSchema } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import type { DeleteSpeciesUseCase } from "#src/modules/species/useCase/DeleteSpeciesUseCase";

export class DeleteSpeciesController extends AbstractController {
  constructor(private readonly useCase: DeleteSpeciesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, speciesId } = RequestSpeciesParamsSchema.parse(request.params);
      const command = SpeciesLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        speciesId,
        command,
      });
    });
}
