import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { AdjustItemQuantitySchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { AdjustItemQuantityUseCase } from "#src/modules/items/useCase/AdjustItemQuantityUseCase";

export class AdjustItemQuantityController extends AbstractController {
  constructor(private readonly useCase: AdjustItemQuantityUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = AdjustItemQuantitySchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
