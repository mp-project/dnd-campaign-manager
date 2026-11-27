import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignFeatsParamsSchema,
  RequestFeatCatalogQuerySchema,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { ListFeatCatalogUseCase } from "#src/modules/feats/useCase/ListFeatCatalogUseCase";

export class ListFeatCatalogController extends AbstractController {
  constructor(private readonly useCase: ListFeatCatalogUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignFeatsParamsSchema.parse(request.params);
      const query = RequestFeatCatalogQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, query }));
    });
}
