import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetParamsSchema } from "#src/modules/assets/domain/dto/RequestAssetDto";
import { UpdateAssetMetadataSchema } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import { UpdateAssetUseCase } from "#src/modules/assets/useCase/UpdateAssetUseCase";

export class UpdateAssetController extends AbstractController {
  constructor(private readonly updateAssetUseCase: UpdateAssetUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestAssetParamsSchema.parse(request.params);
      const body = UpdateAssetMetadataSchema.parse(request.body);

      return this.updateAssetUseCase.execute(
        request.requestContext,
        params.assetId,
        body,
      );
    });
}
