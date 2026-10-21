import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestCatalogParamsSchema,
  RequestCatalogQuerySchema,
} from "#src/modules/assets/domain/dto/RequestAssetDto";
import { ListCatalogUseCase } from "#src/modules/assets/useCase/ListCatalogUseCase";

export class ListCatalogController extends AbstractController {
  constructor(private readonly listCatalogUseCase: ListCatalogUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCatalogParamsSchema.parse(request.params);
      const query = RequestCatalogQuerySchema.parse(request.query);

      return this.listCatalogUseCase.execute(
        request.requestContext,
        params.assetType,
        query,
      );
    });
}
