import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  RequestMediaContentQuerySchema,
  RequestMediaItemParamsSchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import { GetMediaLinkUseCase } from "#src/modules/media/useCase/GetMediaLinkUseCase";

export class GetMediaLinkController extends AbstractController {
  constructor(private readonly useCase: GetMediaLinkUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaItemParamsSchema.parse(request.params);
      const query = RequestMediaContentQuerySchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, query });
    });
}
