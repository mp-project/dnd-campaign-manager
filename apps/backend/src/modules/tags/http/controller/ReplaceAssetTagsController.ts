import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetTagsParamsSchema } from "#src/modules/tags/domain/dto/RequestTagDto";
import { ReplaceAssetTagsSchema } from "#src/modules/tags/domain/dto/UpdateTagDto";
import { ReplaceAssetTagsUseCase } from "#src/modules/tags/useCase/ReplaceAssetTagsUseCase";

export class ReplaceAssetTagsController extends AbstractController {
  constructor(private readonly replaceAssetTagsUseCase: ReplaceAssetTagsUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestAssetTagsParamsSchema.parse(request.params);
      const command = ReplaceAssetTagsSchema.parse(request.body);

      return this.replaceAssetTagsUseCase.execute(request.requestContext, { ...params, command });
    });
}
