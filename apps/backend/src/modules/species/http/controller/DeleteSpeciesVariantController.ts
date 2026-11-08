import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesVariantParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import { SpeciesLifecycleCommandSchema } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import type { DeleteSpeciesVariantUseCase } from "#src/modules/species/useCase/DeleteSpeciesVariantUseCase";

export class DeleteSpeciesVariantController extends AbstractController {
  constructor(private readonly useCase: DeleteSpeciesVariantUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, ...path } = RequestSpeciesVariantParamsSchema.parse(request.params);
      const command = SpeciesLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        ...path,
        command,
      });
    });
}
