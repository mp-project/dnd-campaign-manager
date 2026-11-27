import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { MergeItemInstancesSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { MergeItemInstancesUseCase } from "#src/modules/items/useCase/MergeItemInstancesUseCase";

export class MergeItemInstancesController extends AbstractController {
  constructor(private readonly useCase: MergeItemInstancesUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = MergeItemInstancesSchema.parse(request.body);

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
