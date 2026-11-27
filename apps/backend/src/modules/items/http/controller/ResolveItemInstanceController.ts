import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestItemInstanceParamsSchema,
  ResolveItemInstanceSchema,
} from "#src/modules/items/domain/dto/RequestItemDto";
import type { ResolveItemInstanceUseCase } from "#src/modules/items/useCase/ResolveItemInstanceUseCase";

export class ResolveItemInstanceController extends AbstractController {
  constructor(private readonly useCase: ResolveItemInstanceUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestItemInstanceParamsSchema.parse(request.params);
      const command = ResolveItemInstanceSchema.parse(request.body ?? {});

      return this.ok(await this.useCase.execute(request.requestContext, { ...params, command }));
    });
}
