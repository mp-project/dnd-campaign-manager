import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestContentSharesParamsSchema } from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import { CreateContentShareSchema } from "#src/modules/content-shares/domain/dto/CreateContentShareDto";
import { CreateContentShareUseCase } from "#src/modules/content-shares/useCase/CreateContentShareUseCase";

export class CreateContentShareController extends AbstractController {
  constructor(private readonly createContentShareUseCase: CreateContentShareUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestContentSharesParamsSchema.parse(request.params);
      const command = CreateContentShareSchema.parse(request.body);

      return this.createContentShareUseCase.execute(request.requestContext, { ...params, command });
    });
}
