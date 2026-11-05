import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetMediaParamsSchema } from "#src/modules/media/domain/dto/RequestMediaDto";
import { ListAssetMediaUseCase } from "#src/modules/media/useCase/ListAssetMediaUseCase";

export class ListAssetMediaController extends AbstractController {
  constructor(private readonly useCase: ListAssetMediaUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetMediaParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
