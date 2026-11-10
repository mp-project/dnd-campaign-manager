import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestActorItemParamsSchema } from "#src/modules/actors/domain/dto/RequestActorDto";
import { ActorLifecycleCommandSchema } from "#src/modules/actors/domain/dto/UpdateActorDto";
import { RestoreActorUseCase } from "#src/modules/actors/useCase/RestoreActorUseCase";

export class RestoreActorController extends AbstractController {
  constructor(private readonly useCase: RestoreActorUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorItemParamsSchema.parse(request.params);
      const command = ActorLifecycleCommandSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
