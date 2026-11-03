import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestUsersListQuerySchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { ListUsersUseCase } from "#src/modules/users/useCase/ListUsersUseCase";

export class ListUsersController extends AbstractController {
  constructor(private readonly listUsersUseCase: ListUsersUseCase) {
    super();
  }

  handle = async (request: { query: unknown; requestContext: RequestContext }) =>
    this.execute(async () => {
      const query = RequestUsersListQuerySchema.parse(request.query);

      return this.listUsersUseCase.execute(request.requestContext, query);
    });
}
