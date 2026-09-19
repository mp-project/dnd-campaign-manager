import type { RequestContext } from "#core/http/requestContext";
import type { FastifyReply } from "fastify";

import { AdminUpdateUserSchema } from "#src/modules/users/domain/dto/AdminUpdateUserDto";
import { RequestUserParamsSchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { AdminGetUserByIdUseCase } from "#src/modules/users/useCase/AdminGetUserByIdUseCase";
import { AdminUpdateUserUseCase } from "#src/modules/users/useCase/AdminUpdateUserUseCase";
import { toAdminUserResponse } from "#src/modules/users/http/controller/UserResponseMapper";

export class AdminUpdateUserController {
  constructor(
    private readonly adminGetUserByIdUseCase: AdminGetUserByIdUseCase,
    private readonly adminUpdateUserUseCase: AdminUpdateUserUseCase,
  ) {}

  handle = async (request: {
    params: unknown;
    body: unknown;
    requestContext: RequestContext;
  }) => {
    const params = RequestUserParamsSchema.parse(request.params);
    const body = AdminUpdateUserSchema.parse(request.body);
    const user = await this.adminUpdateUserUseCase.execute(
      request.requestContext,
      params.userId,
      body,
    );

    return toAdminUserResponse(user);
  };

  handleDelete = async (
    request: { params: unknown; requestContext: RequestContext },
    reply: FastifyReply,
  ) => {
    const params = RequestUserParamsSchema.parse(request.params);
    const current = await this.adminGetUserByIdUseCase.execute(
      request.requestContext,
      params.userId,
    );

    await this.adminUpdateUserUseCase.execute(request.requestContext, params.userId, {
      expectedVersion: current.version,
      status: "DISABLED",
    });

    return reply.code(204).send();
  };
}
