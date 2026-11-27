import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { ItemLifecycleCommandSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { DeleteItemUseCase } from "#src/modules/items/useCase/DeleteItemUseCase";

export class DeleteItemController extends AbstractController {
  constructor(private readonly useCase: DeleteItemUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    query: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, itemId } = RequestItemParamsSchema.parse(request.params);
      const command = ItemLifecycleCommandSchema.parse(request.query);

      return this.ok(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, itemId, command }),
      );
    });
}
