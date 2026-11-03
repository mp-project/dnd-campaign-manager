import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { UpdateMeSchema } from "#src/modules/users/domain/dto/UpdateMeDto";
import { UpdateMeUseCase } from "#src/modules/users/useCase/UpdateMeUseCase";

export class UpdateMeController extends AbstractController {
  constructor(private readonly updateMeUseCase: UpdateMeUseCase) {
    super();
  }

  handle = async (request: { body: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const body = UpdateMeSchema.parse(request.body);

      return this.updateMeUseCase.execute(request.requestContext, body);
    });
}
