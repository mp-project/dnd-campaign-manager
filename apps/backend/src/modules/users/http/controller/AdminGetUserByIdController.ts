import type { RequestContext } from "#core/http/requestContext";

import { RequestUserParamsSchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { AdminGetUserByIdUseCase } from "#src/modules/users/useCase/AdminGetUserByIdUseCase";
import { toAdminUserResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class AdminGetUserByIdController {
  constructor(private readonly adminGetUserByIdUseCase: AdminGetUserByIdUseCase) {}

  handle = async (request: { params: unknown; requestContext: RequestContext }) => {
    const params = RequestUserParamsSchema.parse(request.params);
    const user = await this.adminGetUserByIdUseCase.execute(
      request.requestContext,
      params.userId,
    );

    return toAdminUserResponse(user);
  };
}
