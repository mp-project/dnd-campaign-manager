import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import type { GetItemUseCase } from "#src/modules/items/useCase/GetItemUseCase";

export class GetItemController extends AbstractController {
  constructor(private readonly useCase: GetItemUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestItemParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
