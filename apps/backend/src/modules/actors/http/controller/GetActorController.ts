import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestActorItemParamsSchema } from "#src/modules/actors/domain/dto/RequestActorDto";
import { GetActorUseCase } from "#src/modules/actors/useCase/GetActorUseCase";

export class GetActorController extends AbstractController {
  constructor(private readonly useCase: GetActorUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorItemParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
