import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSpeciesParamsSchema, SpeciesSelectionSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ResolveSpeciesSelectionUseCase } from "#src/modules/species/useCase/SpeciesCatalogUseCases";

export class ResolveSpeciesSelectionController extends AbstractController {
  constructor(private readonly useCase: ResolveSpeciesSelectionUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignSpeciesParamsSchema.parse(request.params);
      const command = SpeciesSelectionSchema.parse(request.body ?? {});

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
