import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetParamsSchema } from "#src/modules/assets/domain/dto/RequestAssetDto";
import { GetAssetByIdUseCase } from "#src/modules/assets/useCase/GetAssetByIdUseCase";

export class GetAssetByIdController extends AbstractController {
  constructor(private readonly getAssetByIdUseCase: GetAssetByIdUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetParamsSchema.parse(request.params);

      return this.getAssetByIdUseCase.execute(
        request.requestContext,
        params.assetId,
      );
    });
}
