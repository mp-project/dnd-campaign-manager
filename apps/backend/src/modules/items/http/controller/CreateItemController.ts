import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { CreateItemSchema } from "#src/modules/items/domain/dto/CreateItemDto";
import { RequestScopeParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import type { CreateItemUseCase } from "#src/modules/items/useCase/CreateItemUseCase";

export class CreateItemController extends AbstractController {
  constructor(private readonly useCase: CreateItemUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const { campaignId } = RequestScopeParamsSchema.parse(request.params ?? {});
      const command = CreateItemSchema.parse(request.body);

      return this.created(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, command }),
      );
    });
}
