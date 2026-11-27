import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ValidateItemUseCase } from "#src/modules/items/useCase/ValidateItemUseCase";

export class ValidateItemController extends AbstractController {
  constructor(private readonly useCase: ValidateItemUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const { campaignId, itemId } = RequestItemParamsSchema.parse(request.params);

      return this.ok(
        await this.useCase.execute(request.requestContext, { campaignId: campaignId ?? null, itemId }),
      );
    });
}
