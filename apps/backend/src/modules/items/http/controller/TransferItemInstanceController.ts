import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { TransferItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { TransferItemInstanceUseCase } from "#src/modules/items/useCase/TransferItemInstanceUseCase";

export class TransferItemInstanceController extends AbstractController {
  constructor(private readonly useCase: TransferItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = TransferItemInstanceSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
