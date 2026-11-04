import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetLinkItemParamsSchema } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import { DeleteAssetLinkUseCase } from "#src/modules/asset-links/useCase/DeleteAssetLinkUseCase";

export class DeleteAssetLinkController extends AbstractController {
  constructor(private readonly deleteAssetLinkUseCase: DeleteAssetLinkUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetLinkItemParamsSchema.parse(request.params);

      return this.deleteAssetLinkUseCase.execute(request.requestContext, params);
    });
}
