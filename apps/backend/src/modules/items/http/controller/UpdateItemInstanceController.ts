import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { UpdateItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { UpdateItemInstanceUseCase } from "#src/modules/items/useCase/UpdateItemInstanceUseCase";

export class UpdateItemInstanceController extends AbstractController {
  constructor(private readonly useCase: UpdateItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = UpdateItemInstanceSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
