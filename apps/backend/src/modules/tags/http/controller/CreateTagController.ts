import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateTagSchema } from "#src/modules/tags/domain/dto/CreateTagDto";
import { RequestTagsParamsSchema } from "#src/modules/tags/domain/dto/RequestTagDto";
import { CreateTagUseCase } from "#src/modules/tags/useCase/CreateTagUseCase";

export class CreateTagController extends AbstractController {
  constructor(private readonly createTagUseCase: CreateTagUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestTagsParamsSchema.parse(request.params);
      const command = CreateTagSchema.parse(request.body);

      return this.createTagUseCase.execute(request.requestContext, { ...params, command });
    });
}
