import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestUserParamsSchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { UpdateUserSchema } from "#src/modules/users/domain/dto/UpdateUserDto";
import { UpdateUserUseCase } from "#src/modules/users/useCase/UpdateUserUseCase";

export class UpdateUserController extends AbstractController {
  constructor(private readonly updateUserUseCase: UpdateUserUseCase) {
    super();
  }

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) =>
    this.execute(async () => {
      const params = RequestUserParamsSchema.parse(request.params);
      const body = UpdateUserSchema.parse(request.body);

      return this.updateUserUseCase.execute(request.requestContext, params.userId, body);
    });
}
