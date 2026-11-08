import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateSpeciesSchema } from "#src/modules/species/domain/dto/CreateSpeciesDto";
import { RequestCampaignSpeciesListParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { CreateSpeciesUseCase } from "#src/modules/species/useCase/CreateSpeciesUseCase";

export class CreateSpeciesController extends AbstractController {
  constructor(private readonly useCase: CreateSpeciesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId } = RequestCampaignSpeciesListParamsSchema.partial().parse(request.params ?? {});
      const command = CreateSpeciesSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, {
        campaignId: campaignId ?? null,
        command,
      });
    });
}
