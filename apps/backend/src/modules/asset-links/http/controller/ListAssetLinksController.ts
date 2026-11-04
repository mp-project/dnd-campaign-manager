import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestAssetLinksParamsSchema,
  RequestAssetLinksQuerySchema,
} from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import { ListAssetLinksUseCase } from "#src/modules/asset-links/useCase/ListAssetLinksUseCase";

export class ListAssetLinksController extends AbstractController {
  constructor(private readonly listAssetLinksUseCase: ListAssetLinksUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestAssetLinksParamsSchema.parse(request.params);
      const query = RequestAssetLinksQuerySchema.parse(request.query);

      return this.listAssetLinksUseCase.execute(request.requestContext, { ...params, query });
    });
}
