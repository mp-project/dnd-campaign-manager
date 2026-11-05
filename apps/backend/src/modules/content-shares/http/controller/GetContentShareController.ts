import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestContentShareItemParamsSchema } from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import { GetContentShareUseCase } from "#src/modules/content-shares/useCase/GetContentShareUseCase";

export class GetContentShareController extends AbstractController {
  constructor(private readonly getContentShareUseCase: GetContentShareUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestContentShareItemParamsSchema.parse(request.params);

      return this.getContentShareUseCase.execute(request.requestContext, params);
    });
}
