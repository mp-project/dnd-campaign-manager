import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import { SpeciesLifecycleCommandSchema } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import type { RestoreSpeciesUseCase } from "#src/modules/species/useCase/RestoreSpeciesUseCase";

export class RestoreSpeciesController extends AbstractController {
  constructor(private readonly useCase: RestoreSpeciesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, speciesId } = RequestSpeciesParamsSchema.parse(request.params);
      const command = SpeciesLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        speciesId,
        command,
      });
    });
}
