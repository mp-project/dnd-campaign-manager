import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetParamsSchema } from "#src/modules/assets/domain/dto/RequestAssetDto";
import { AssetLifecycleCommandSchema } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import { DeleteAssetUseCase } from "#src/modules/assets/useCase/DeleteAssetUseCase";

export class DeleteAssetController extends AbstractController {
  constructor(private readonly deleteAssetUseCase: DeleteAssetUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestAssetParamsSchema.parse(request.params);
      const query = AssetLifecycleCommandSchema.parse(request.query);

      return this.deleteAssetUseCase.execute(
        request.requestContext,
        params.assetId,
        query,
      );
    });
}
