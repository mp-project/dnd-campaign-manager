import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { SplitItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { SplitItemInstanceUseCase } from "#src/modules/items/useCase/SplitItemInstanceUseCase";

export class SplitItemInstanceController extends AbstractController {
  constructor(private readonly useCase: SplitItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = SplitItemInstanceSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
