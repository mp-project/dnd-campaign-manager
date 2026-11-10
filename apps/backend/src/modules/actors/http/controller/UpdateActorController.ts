import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestActorItemParamsSchema } from "#src/modules/actors/domain/dto/RequestActorDto";
import { UpdateActorSchema } from "#src/modules/actors/domain/dto/UpdateActorDto";
import { UpdateActorUseCase } from "#src/modules/actors/useCase/UpdateActorUseCase";

export class UpdateActorController extends AbstractController {
  constructor(private readonly useCase: UpdateActorUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorItemParamsSchema.parse(request.params);
      const command = UpdateActorSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
