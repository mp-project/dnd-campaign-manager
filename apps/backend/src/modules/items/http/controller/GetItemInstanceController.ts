import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { RequestItemInstanceParamsSchema } from "#src/modules/items/domain/dto/RequestItemDto";
import type { GetItemInstanceUseCase } from "#src/modules/items/useCase/GetItemInstanceUseCase";

export class GetItemInstanceController extends AbstractController {
  constructor(private readonly useCase: GetItemInstanceUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);

      return this.ok(await this.useCase.execute(request.requestContext, params));
    });
}
