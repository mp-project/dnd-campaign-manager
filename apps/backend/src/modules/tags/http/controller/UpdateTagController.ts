import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestTagItemParamsSchema } from "#src/modules/tags/domain/dto/RequestTagDto";
import { UpdateTagSchema } from "#src/modules/tags/domain/dto/UpdateTagDto";
import { UpdateTagUseCase } from "#src/modules/tags/useCase/UpdateTagUseCase";

export class UpdateTagController extends AbstractController {
  constructor(private readonly updateTagUseCase: UpdateTagUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestTagItemParamsSchema.parse(request.params);
      const command = UpdateTagSchema.parse(request.body);

      return this.updateTagUseCase.execute(request.requestContext, { ...params, command });
    });
}
