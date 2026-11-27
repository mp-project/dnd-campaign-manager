import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { AttuneItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { AttuneItemInstanceUseCase } from "#src/modules/items/useCase/AttuneItemInstanceUseCase";

export class AttuneItemInstanceController extends AbstractController {
  constructor(private readonly useCase: AttuneItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = AttuneItemInstanceSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
