import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestCampaignParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import { CreateItemInstanceSchema } from "#src/modules/items/domain/dto/UpdateItemDto";
import type { CreateItemInstanceUseCase } from "#src/modules/items/useCase/CreateItemInstanceUseCase";

export class CreateItemInstanceController extends AbstractController {
  constructor(private readonly useCase: CreateItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestCampaignParamsSchema.parse(request.params);
      const command = CreateItemInstanceSchema.parse(request.body);

      return this.created(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
