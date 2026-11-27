import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  RequestSystemBackgroundsQuerySchema,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { ListSystemBackgroundsUseCase } from "#src/modules/backgrounds/useCase/ListSystemBackgroundsUseCase";

export class ListSystemBackgroundsController extends AbstractController {
  constructor(private readonly useCase: ListSystemBackgroundsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestSystemBackgroundsQuerySchema.parse(request.query);

      return this.ok(await this.useCase.execute(request.requestContext, { query }));
    });
}
