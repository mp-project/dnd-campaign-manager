import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignSpeciesListParamsSchema,
  RequestSpeciesCatalogQuerySchema,
} from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { ListSpeciesCatalogUseCase } from "#src/modules/species/useCase/ListSpeciesCatalogUseCase";

export class ListSpeciesCatalogController extends AbstractController {
  constructor(private readonly useCase: ListSpeciesCatalogUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignSpeciesListParamsSchema.parse(request.params);
      const query = RequestSpeciesCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
