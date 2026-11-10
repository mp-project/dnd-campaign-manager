import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestActorItemParamsSchema } from "#src/modules/actors/domain/dto/RequestActorDto";
import { GetActorStatBlockUseCase } from "#src/modules/actors/useCase/GetActorStatBlockUseCase";

export class GetActorStatBlockController extends AbstractController {
  constructor(private readonly useCase: GetActorStatBlockUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorItemParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
