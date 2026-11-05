import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestMediaParamsSchema,
  RequestMediaQuerySchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import { ListMediaUseCase } from "#src/modules/media/useCase/ListMediaUseCase";

export class ListMediaController extends AbstractController {
  constructor(private readonly useCase: ListMediaUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaParamsSchema.parse(request.params);
      const query = RequestMediaQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}
