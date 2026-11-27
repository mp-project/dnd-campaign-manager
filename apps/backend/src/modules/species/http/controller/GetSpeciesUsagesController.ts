import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignSpeciesParamsSchema } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { GetSpeciesUsagesUseCase } from "#src/modules/species/useCase/GetSpeciesUsagesUseCase";

export class GetSpeciesUsagesController extends AbstractController {
  constructor(private readonly useCase: GetSpeciesUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      return this.ok(await this.useCase.execute(
        request.requestContext,
        RequestCampaignSpeciesParamsSchema.parse(request.params),
      ));
    });
}
