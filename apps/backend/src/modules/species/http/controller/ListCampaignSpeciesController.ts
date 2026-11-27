import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSpeciesListParamsSchema,
  RequestCampaignSpeciesQuerySchema,
} from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ListCampaignSpeciesUseCase } from "#src/modules/species/useCase/ListCampaignSpeciesUseCase";

export class ListCampaignSpeciesController extends AbstractController {
  constructor(private readonly useCase: ListCampaignSpeciesUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignSpeciesListParamsSchema.parse(request.params);
      const query = RequestCampaignSpeciesQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
