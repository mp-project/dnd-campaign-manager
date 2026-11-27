import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { SpendItemChargeSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { SpendItemChargeUseCase } from "#src/modules/items/useCase/SpendItemChargeUseCase";

export class SpendItemChargeController extends AbstractController {
  constructor(private readonly useCase: SpendItemChargeUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = SpendItemChargeSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
