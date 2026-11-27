import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { IdentifyItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { IdentifyItemInstanceUseCase } from "#src/modules/items/useCase/IdentifyItemInstanceUseCase";

export class IdentifyItemInstanceController extends AbstractController {
  constructor(private readonly useCase: IdentifyItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = IdentifyItemInstanceSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
