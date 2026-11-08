import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { GetSpeciesFeaturesUseCase } from "#src/modules/species/useCase/SpeciesCatalogUseCases";

export class GetSpeciesFeaturesController extends AbstractController {
  constructor(private readonly useCase: GetSpeciesFeaturesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      return this.useCase.execute(
        request.requestContext,
        RequestCampaignSpeciesParamsSchema.parse(request.params),
      );
    });
}
