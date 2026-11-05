import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestMediaUploadParamsSchema } from "#src/modules/media/domain/dto/RequestMediaDto";
import { CompleteMediaUploadUseCase } from "#src/modules/media/useCase/CompleteMediaUploadUseCase";

export class CompleteMediaUploadController extends AbstractController {
  constructor(private readonly useCase: CompleteMediaUploadUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaUploadParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
