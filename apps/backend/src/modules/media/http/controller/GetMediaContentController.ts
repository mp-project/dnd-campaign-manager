import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestMediaContentQuerySchema,
  RequestMediaItemParamsSchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import { GetMediaContentUseCase } from "#src/modules/media/useCase/GetMediaContentUseCase";

export class GetMediaContentController extends AbstractController {
  constructor(private readonly useCase: GetMediaContentUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaItemParamsSchema.parse(request.params);
      const query = RequestMediaContentQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}
