import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetParamsSchema } from "#src/modules/assets/domain/dto/RequestAssetDto";
import { AssetLifecycleCommandSchema } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import { RestoreAssetUseCase } from "#src/modules/assets/useCase/RestoreAssetUseCase";

export class RestoreAssetController extends AbstractController {
  constructor(private readonly restoreAssetUseCase: RestoreAssetUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestAssetParamsSchema.parse(request.params);
      const body = AssetLifecycleCommandSchema.parse(request.body);

      return this.restoreAssetUseCase.execute(
        request.requestContext,
        params.assetId,
        body,
      );
    });
}
