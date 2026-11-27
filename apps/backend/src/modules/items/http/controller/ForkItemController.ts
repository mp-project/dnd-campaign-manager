import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { ForkItemSchema } from "#src/modules/items/domain/dto/CreateItemDto";
import { RequestCampaignItemParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ForkItemUseCase } from "#src/modules/items/useCase/ForkItemUseCase";

export class ForkItemController extends AbstractController {
  constructor(private readonly useCase: ForkItemUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignItemParamsSchema.parse(request.params);
      const command = ForkItemSchema.parse(request.body ?? {});

      return this.created(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
