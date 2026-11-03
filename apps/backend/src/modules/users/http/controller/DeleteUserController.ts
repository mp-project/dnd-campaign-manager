import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestUserParamsSchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { DeleteUserUseCase } from "#src/modules/users/useCase/DeleteUserUseCase";

export class DeleteUserController extends AbstractController {
  constructor(private readonly deleteUserUseCase: DeleteUserUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestUserParamsSchema.parse(request.params);

      await this.deleteUserUseCase.execute(request.requestContext, params.userId);
    });
}
