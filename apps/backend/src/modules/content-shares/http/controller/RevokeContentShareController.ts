import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestContentShareItemParamsSchema } from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import { RevokeContentShareUseCase } from "#src/modules/content-shares/useCase/RevokeContentShareUseCase";

export class RevokeContentShareController extends AbstractController {
  constructor(private readonly revokeContentShareUseCase: RevokeContentShareUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestContentShareItemParamsSchema.parse(request.params);

      return this.revokeContentShareUseCase.execute(request.requestContext, params);
    });
}
