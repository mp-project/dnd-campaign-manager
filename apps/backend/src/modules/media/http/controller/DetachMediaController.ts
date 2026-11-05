import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestAssetMediaItemParamsSchema } from "#src/modules/media/domain/dto/RequestMediaDto";
import { DetachMediaUseCase } from "#src/modules/media/useCase/DetachMediaUseCase";

export class DetachMediaController extends AbstractController {
  constructor(private readonly useCase: DetachMediaUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestAssetMediaItemParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
