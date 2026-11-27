import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestCampaignItemParamsSchema,
  ResolveItemSchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
import type { ResolveItemUseCase } from "#src/modules/items/useCase/ResolveItemUseCase";

export class ResolveItemController extends AbstractController {
  constructor(private readonly useCase: ResolveItemUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignItemParamsSchema.parse(request.params);
      const command = ResolveItemSchema.parse(request.body ?? {});

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
