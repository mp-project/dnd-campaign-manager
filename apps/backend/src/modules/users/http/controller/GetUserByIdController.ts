import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestUserParamsSchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { GetUserByIdUseCase } from "#src/modules/users/useCase/GetUserByIdUseCase";

export class GetUserByIdController extends AbstractController {
  constructor(private readonly getUserByIdUseCase: GetUserByIdUseCase) {
    super();
  }

  handle = async (request: { params: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const params = RequestUserParamsSchema.parse(request.params);

      return this.getUserByIdUseCase.execute(request.requestContext, params.userId);
    });
}
