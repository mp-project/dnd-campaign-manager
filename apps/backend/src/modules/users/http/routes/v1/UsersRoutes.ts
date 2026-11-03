import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  RequestUserParamsSchema,
  RequestUsersListQuerySchema,
} from "#src/modules/users/domain/dto/RequestUsersDto";
import {
  ResponseUserSchema,
  ResponseReadableUserListSchema,
  ResponseReadableUserSchema,
  ResponseMeCampaignOverviewSchema,
  ResponseMeSchema,
} from "#src/modules/users/domain/dto/ResponseUsersDto";
import { UpdateMeSchema } from "#src/modules/users/domain/dto/UpdateMeDto";
import { UpdateSettingsSchema } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import { UpdateUserSchema } from "#src/modules/users/domain/dto/UpdateUserDto";
import { USERS_PERMISSIONS } from "#src/modules/users/permissions/UsersPermissions";
import { GetMeController } from "#src/modules/users/http/controller/GetMeController";
import { UpdateMeController } from "#src/modules/users/http/controller/UpdateMeController";
import { UpdateSettingsController } from "#src/modules/users/http/controller/UpdateSettingsController";
import { GetMyCampaignOverviewController } from "#src/modules/users/http/controller/GetMyCampaignOverviewController";
import { ListUsersController } from "#src/modules/users/http/controller/ListUsersController";
import { GetUserByIdController } from "#src/modules/users/http/controller/GetUserByIdController";
import { UpdateUserController } from "#src/modules/users/http/controller/UpdateUserController";
import { DeleteUserController } from "#src/modules/users/http/controller/DeleteUserController";

export type UsersRouteControllers = {
  getMeController: GetMeController;
  updateMeController: UpdateMeController;
  updateSettingsController: UpdateSettingsController;
  getMyCampaignOverviewController: GetMyCampaignOverviewController;
  listUsersController: ListUsersController;
  getUserByIdController: GetUserByIdController;
  updateUserController: UpdateUserController;
  deleteUserController: DeleteUserController;
};

const tags = ["Users"];
const security = [{ cookieAuth: [] }] as const;

export function registerUsersRoutes(
  app: FastifyInstance,
  controllers: UsersRouteControllers,
): void {
  app.get(
    "/me",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.readSelf },
      },
      schema: {
        tags,
        operationId: "getMe",
        security,
        response: {
          200: ResponseMeSchema,
          401: errorResponseDto,
        },
      },
    },
    controllers.getMeController.handle,
  );

  app.patch(
    "/me",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.updateSelf },
      },
      schema: {
        tags,
        operationId: "updateMe",
        security,
        body: UpdateMeSchema,
        response: {
          200: ResponseMeSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.updateMeController.handle,
  );

  app.patch(
    "/me/settings",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.updateSelf },
      },
      schema: {
        tags,
        operationId: "updateMySettings",
        security,
        body: UpdateSettingsSchema,
        response: {
          200: ResponseMeSchema,
          400: errorResponseDto,
          401: errorResponseDto,
        },
      },
    },
    controllers.updateSettingsController.handle,
  );

  app.get(
    "/me/campaigns",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.readSelf },
      },
      schema: {
        tags,
        operationId: "getMyCampaignOverview",
        security,
        response: {
          200: ResponseMeCampaignOverviewSchema,
          401: errorResponseDto,
        },
      },
    },
    controllers.getMyCampaignOverviewController.handle,
  );

  app.get(
    "/users",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "listUsers",
        security,
        querystring: RequestUsersListQuerySchema,
        response: {
          200: ResponseReadableUserListSchema,
          401: errorResponseDto,
          403: errorResponseDto,
        },
      },
    },
    controllers.listUsersController.handle,
  );

  app.get(
    "/users/:userId",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.read },
      },
      schema: {
        tags,
        operationId: "getUserById",
        security,
        params: RequestUserParamsSchema,
        response: {
          200: ResponseReadableUserSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.getUserByIdController.handle,
  );

  app.patch(
    "/users/:userId",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.update },
      },
      schema: {
        tags,
        operationId: "updateUser",
        security,
        params: RequestUserParamsSchema,
        body: UpdateUserSchema,
        response: {
          200: ResponseUserSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controllers.updateUserController.handle,
  );

  app.delete(
    "/users/:userId",
    {
      config: {
        permission: { key: USERS_PERMISSIONS.delete },
      },
      schema: {
        tags,
        operationId: "deleteUser",
        security,
        params: RequestUserParamsSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.deleteUserController.handle(request);
      return reply.code(204).send();
    },
  );
}
