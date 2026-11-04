import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetLinksParamsSchema } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import { GetAssetUsagesUseCase } from "#src/modules/asset-links/useCase/GetAssetUsagesUseCase";

export class GetAssetUsagesController extends AbstractController {
  constructor(private readonly getAssetUsagesUseCase: GetAssetUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetLinksParamsSchema.parse(request.params);

      return this.getAssetUsagesUseCase.execute(request.requestContext, params);
    });
}
