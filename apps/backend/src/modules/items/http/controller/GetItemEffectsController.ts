import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignItemParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import type { GetItemEffectsUseCase } from "#src/modules/items/useCase/GetItemEffectsUseCase";

export class GetItemEffectsController extends AbstractController {
  constructor(private readonly useCase: GetItemEffectsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestCampaignItemParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
