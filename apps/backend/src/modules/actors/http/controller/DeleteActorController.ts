import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestActorItemParamsSchema } from "#src/modules/actors/domain/dto/RequestActorDto";
import { ActorLifecycleCommandSchema } from "#src/modules/actors/domain/dto/UpdateActorDto";
import { DeleteActorUseCase } from "#src/modules/actors/useCase/DeleteActorUseCase";

export class DeleteActorController extends AbstractController {
  constructor(private readonly useCase: DeleteActorUseCase) {
    super();
  }

  handle = async (request: { params: unknown; query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorItemParamsSchema.parse(request.params);
      const command = ActorLifecycleCommandSchema.parse(request.query);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
