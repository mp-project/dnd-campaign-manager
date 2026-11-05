import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestMediaUploadParamsSchema } from "#src/modules/media/domain/dto/RequestMediaDto";
import { GetMediaUploadUseCase } from "#src/modules/media/useCase/GetMediaUploadUseCase";

export class GetMediaUploadController extends AbstractController {
  constructor(private readonly useCase: GetMediaUploadUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaUploadParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
