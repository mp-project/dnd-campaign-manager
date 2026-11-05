import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestContentShareItemParamsSchema } from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import { GetSharedContentUseCase } from "#src/modules/content-shares/useCase/GetSharedContentUseCase";

export class GetSharedContentController extends AbstractController {
  constructor(private readonly getSharedContentUseCase: GetSharedContentUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestContentShareItemParamsSchema.parse(request.params);

      return this.getSharedContentUseCase.execute(request.requestContext, params);
    });
}
