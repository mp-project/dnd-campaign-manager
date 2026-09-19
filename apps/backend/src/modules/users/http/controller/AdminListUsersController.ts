import type { RequestContext } from "#core/http/requestContext";
import { createStandardListResponse } from "#core/http/listResponse";

import { RequestAdminUsersListQuerySchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { AdminListUsersUseCase } from "#src/modules/users/useCase/AdminListUsersUseCase";
import { toAdminUserResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class AdminListUsersController {
  constructor(private readonly adminListUsersUseCase: AdminListUsersUseCase) {}

  handle = async (request: { query: unknown; requestContext: RequestContext }) => {
    const query = RequestAdminUsersListQuerySchema.parse(request.query);
    const result = await this.adminListUsersUseCase.execute(request.requestContext, query);

    return createStandardListResponse({
      data: result.items.map(toAdminUserResponse),
      limit: query.limit,
      nextCursor: null,
      total: result.total,
    });
  };
}
