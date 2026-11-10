import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestActorItemParamsSchema } from "#src/modules/actors/domain/dto/RequestActorDto";
import { GetActorUsagesUseCase } from "#src/modules/actors/useCase/GetActorUsagesUseCase";

export class GetActorUsagesController extends AbstractController {
  constructor(private readonly useCase: GetActorUsagesUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorItemParamsSchema.parse(request.params);

      return this.useCase.execute(request.requestContext, params);
    });
}
