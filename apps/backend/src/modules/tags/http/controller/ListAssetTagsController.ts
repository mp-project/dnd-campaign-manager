import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetTagsParamsSchema } from "#src/modules/tags/domain/dto/RequestTagDto";
import { ListAssetTagsUseCase } from "#src/modules/tags/useCase/ListAssetTagsUseCase";

export class ListAssetTagsController extends AbstractController {
  constructor(private readonly listAssetTagsUseCase: ListAssetTagsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetTagsParamsSchema.parse(request.params);

      return this.listAssetTagsUseCase.execute(request.requestContext, params);
    });
}
