import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { ItemLifecycleCommandSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { RestoreItemUseCase } from "#src/modules/items/useCase/RestoreItemUseCase";

export class RestoreItemController extends AbstractController {
  constructor(private readonly useCase: RestoreItemUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId, itemId } = RequestItemParamsSchema.parse(request.params);
      const command = ItemLifecycleCommandSchema.parse(request.body);

      return this.ok(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, itemId, command }),
      );
    });
}
