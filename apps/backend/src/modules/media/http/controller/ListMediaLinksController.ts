import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { ListMediaLinksSchema } from "#src/modules/media/domain/dto/MediaLinkDto";
import { RequestMediaParamsSchema } from "#src/modules/media/domain/dto/RequestMediaDto";
import { ListMediaLinksUseCase } from "#src/modules/media/useCase/ListMediaLinksUseCase";

export class ListMediaLinksController extends AbstractController {
  constructor(private readonly useCase: ListMediaLinksUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestMediaParamsSchema.parse(request.params);
      const command = ListMediaLinksSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
