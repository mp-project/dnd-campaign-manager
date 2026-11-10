import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateActorSchema } from "#src/modules/actors/domain/dto/CreateActorDto";
import { RequestActorsParamsSchema } from "#src/modules/actors/domain/dto/RequestActorDto";
import { CreateActorUseCase } from "#src/modules/actors/useCase/CreateActorUseCase";

export class CreateActorController extends AbstractController {
  constructor(private readonly useCase: CreateActorUseCase) {
    super();
  }

  handle = async (request: { params: unknown; body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestActorsParamsSchema.parse(request.params);
      const command = CreateActorSchema.parse(request.body);

      return this.useCase.execute(request.requestContext, { ...params, command });
    });
}
