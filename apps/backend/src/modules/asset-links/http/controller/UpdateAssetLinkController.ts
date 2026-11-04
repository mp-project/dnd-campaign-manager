import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetLinkItemParamsSchema } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import { UpdateAssetLinkSchema } from "#src/modules/asset-links/domain/dto/UpdateAssetLinkDto";
import { UpdateAssetLinkUseCase } from "#src/modules/asset-links/useCase/UpdateAssetLinkUseCase";

export class UpdateAssetLinkController extends AbstractController {
  constructor(private readonly updateAssetLinkUseCase: UpdateAssetLinkUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestAssetLinkItemParamsSchema.parse(request.params);
      const command = UpdateAssetLinkSchema.parse(request.body);

      return this.updateAssetLinkUseCase.execute(request.requestContext, { ...params, command });
    });
}
