import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestSpeciesVariantParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import { UpdateSpeciesVariantSchema } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import type { UpdateSpeciesVariantUseCase } from "#src/modules/species/useCase/UpdateSpeciesVariantUseCase";

export class UpdateSpeciesVariantController extends AbstractController {
  constructor(private readonly useCase: UpdateSpeciesVariantUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, ...path } = RequestSpeciesVariantParamsSchema.parse(request.params);
      const command = UpdateSpeciesVariantSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        ...path,
        command,
      });
    });
}
