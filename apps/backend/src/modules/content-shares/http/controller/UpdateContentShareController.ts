import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestContentShareItemParamsSchema } from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import { UpdateContentShareSchema } from "#src/modules/content-shares/domain/dto/UpdateContentShareDto";
import { UpdateContentShareUseCase } from "#src/modules/content-shares/useCase/UpdateContentShareUseCase";

export class UpdateContentShareController extends AbstractController {
  constructor(private readonly updateContentShareUseCase: UpdateContentShareUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestContentShareItemParamsSchema.parse(request.params);
      const command = UpdateContentShareSchema.parse(request.body);

      return this.updateContentShareUseCase.execute(request.requestContext, { ...params, command });
    });
}
