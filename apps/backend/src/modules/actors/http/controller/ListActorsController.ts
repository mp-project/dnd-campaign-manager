import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestActorsParamsSchema,
  RequestActorsQuerySchema,
} from "#src/modules/actors/domain/dto/RequestActorDto";
import { ListActorsUseCase } from "#src/modules/actors/useCase/ListActorsUseCase";

export class ListActorsController extends AbstractController {
  constructor(private readonly useCase: ListActorsUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorsParamsSchema.parse(request.params);
      const query = RequestActorsQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}
