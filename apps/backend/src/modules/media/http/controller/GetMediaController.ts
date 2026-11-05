import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestMediaItemParamsSchema } from "#src/modules/media/domain/dto/RequestMediaDto";
import { GetMediaUseCase } from "#src/modules/media/useCase/GetMediaUseCase";

export class GetMediaController extends AbstractController {
  constructor(private readonly useCase: GetMediaUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaItemParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
