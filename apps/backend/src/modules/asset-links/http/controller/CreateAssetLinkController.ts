import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateAssetLinkSchema } from "#src/modules/asset-links/domain/dto/CreateAssetLinkDto";
import { RequestAssetLinksParamsSchema } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import { CreateAssetLinkUseCase } from "#src/modules/asset-links/useCase/CreateAssetLinkUseCase";

export class CreateAssetLinkController extends AbstractController {
  constructor(private readonly createAssetLinkUseCase: CreateAssetLinkUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestAssetLinksParamsSchema.parse(request.params);
      const command = CreateAssetLinkSchema.parse(request.body);

      return this.createAssetLinkUseCase.execute(request.requestContext, { ...params, command });
    });
}
