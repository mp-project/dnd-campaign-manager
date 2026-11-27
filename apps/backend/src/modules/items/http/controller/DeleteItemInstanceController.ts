import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { DeleteItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { DeleteItemInstanceUseCase } from "#src/modules/items/useCase/DeleteItemInstanceUseCase";

export class DeleteItemInstanceController extends AbstractController {
  constructor(private readonly useCase: DeleteItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = DeleteItemInstanceSchema.parse(request.query);

      await this.useCase.execute(request.requestContext, { ...params, command });

      return this.noContent();
    });
}
