import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  AdminUpdateUserSchema,
} from "#src/modules/users/domain/dto/AdminUpdateUserDto";
import {
  RequestEmailVerificationSchema,
  RequestEmailVerificationStatusParamsSchema,
} from "#src/modules/users/domain/dto/RequestEmailVerificationDto";
import { RegisterUserSchema } from "#src/modules/users/domain/dto/RegisterUserDto";
import { VerifyEmailVerificationSchema } from "#src/modules/users/domain/dto/VerifyEmailVerificationDto";
import { RequestUserParamsSchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import { RequestAdminUsersListQuerySchema } from "#src/modules/users/domain/dto/RequestUsersDto";
import {
  ResponseAdminUserListSchema,
  ResponseAdminUserSchema,
  ResponseEmailVerificationSchema,
  ResponseMeCampaignOverviewSchema,
  ResponseMeInvitationsSchema,
  ResponseMeSchema,
  ResponseRegisterUserSchema,
} from "#src/modules/users/domain/dto/ResponseUsersDto";
import { UpdateMeSchema } from "#src/modules/users/domain/dto/UpdateMeDto";
import { UpdateSettingsSchema } from "#src/modules/users/domain/dto/UpdateSettingsDto";
import {
  USERS_HTTP_PATHS,
  USERS_HTTP_PERMISSIONS,
  USERS_HTTP_RATE_LIMITS,
  USERS_HTTP_SECURITY,
} from "#src/modules/users/config/UsersHttpConfig";
import { GetMeController } from "#src/modules/users/http/controller/GetMeController";
import { UpdateMeController } from "#src/modules/users/http/controller/UpdateMeController";
import { UpdateSettingsController } from "#src/modules/users/http/controller/UpdateSettingsController";
import { GetMyCampaignOverviewController } from "#src/modules/users/http/controller/GetMyCampaignOverviewController";
import { GetMyInvitationsController } from "#src/modules/users/http/controller/GetMyInvitationsController";
import { AdminListUsersController } from "#src/modules/users/http/controller/AdminListUsersController";
import { AdminGetUserByIdController } from "#src/modules/users/http/controller/AdminGetUserByIdController";
import { AdminUpdateUserController } from "#src/modules/users/http/controller/AdminUpdateUserController";
import { GetEmailVerificationStatusController } from "#src/modules/users/http/controller/GetEmailVerificationStatusController";
import { RegisterUserController } from "#src/modules/users/http/controller/RegisterUserController";
import { RequestEmailVerificationController } from "#src/modules/users/http/controller/RequestEmailVerificationController";
import { VerifyEmailVerificationController } from "#src/modules/users/http/controller/VerifyEmailVerificationController";

export type UsersRouteControllers = {
  getMeController: GetMeController;
  updateMeController: UpdateMeController;
  updateSettingsController: UpdateSettingsController;
  getMyCampaignOverviewController: GetMyCampaignOverviewController;
  getMyInvitationsController: GetMyInvitationsController;
  requestEmailVerificationController: RequestEmailVerificationController;
  getEmailVerificationStatusController: GetEmailVerificationStatusController;
  registerUserController: RegisterUserController;
  verifyEmailVerificationController: VerifyEmailVerificationController;
  adminListUsersController: AdminListUsersController;
  adminGetUserByIdController: AdminGetUserByIdController;
  adminUpdateUserController: AdminUpdateUserController;
};

export function registerUsersRoutes(
  app: FastifyInstance,
  controllers: UsersRouteControllers,
): void {
  app.post(
    USERS_HTTP_PATHS.registerRequestVerification,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.write,
      },
      schema: {
        tags: ["Auth"],
        operationId: "requestRegistrationVerification",
        body: RequestEmailVerificationSchema,
        response: {
          202: ResponseEmailVerificationSchema,
          400: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.requestEmailVerificationController.handle(request);

      return reply.code(202).send(payload);
    },
  );

  app.get(
    USERS_HTTP_PATHS.registerVerificationStatus,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.read,
      },
      schema: {
        tags: ["Auth"],
        operationId: "getRegistrationVerificationStatus",
        params: RequestEmailVerificationStatusParamsSchema,
        response: {
          200: ResponseEmailVerificationSchema,
          400: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.getEmailVerificationStatusController.handle,
  );

  app.post(
    USERS_HTTP_PATHS.register,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.write,
      },
      schema: {
        tags: ["Auth"],
        operationId: "registerUser",
        body: RegisterUserSchema,
        response: {
          201: ResponseRegisterUserSchema,
          400: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.registerUserController.handle(request);

      return reply.code(201).send(payload);
    },
  );

  app.post(
    USERS_HTTP_PATHS.registerVerify,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.write,
      },
      schema: {
        tags: ["Auth"],
        operationId: "verifyRegistrationEmail",
        body: VerifyEmailVerificationSchema,
        response: {
          200: ResponseRegisterUserSchema,
          400: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.verifyEmailVerificationController.handle,
  );

  app.get(
    USERS_HTTP_PATHS.me,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.read,
        permission: {
          key: USERS_HTTP_PERMISSIONS.readSelf,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "getMe",
        security: USERS_HTTP_SECURITY,
        response: {
          200: ResponseMeSchema,
          401: errorResponseDto,
        },
      },
    },
    controllers.getMeController.handle,
  );

  app.patch(
    USERS_HTTP_PATHS.me,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.write,
        permission: {
          key: USERS_HTTP_PERMISSIONS.updateSelf,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "updateMe",
        security: USERS_HTTP_SECURITY,
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
    USERS_HTTP_PATHS.meSettings,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.write,
        permission: {
          key: USERS_HTTP_PERMISSIONS.updateSelf,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "updateMySettings",
        security: USERS_HTTP_SECURITY,
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
    USERS_HTTP_PATHS.meCampaigns,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.read,
        permission: {
          key: USERS_HTTP_PERMISSIONS.readSelf,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "getMyCampaignOverview",
        security: USERS_HTTP_SECURITY,
        response: {
          200: ResponseMeCampaignOverviewSchema,
          401: errorResponseDto,
        },
      },
    },
    controllers.getMyCampaignOverviewController.handle,
  );

  app.get(
    USERS_HTTP_PATHS.meInvitations,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.read,
        permission: {
          key: USERS_HTTP_PERMISSIONS.readSelf,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "getMyInvitations",
        security: USERS_HTTP_SECURITY,
        response: {
          200: ResponseMeInvitationsSchema,
          401: errorResponseDto,
        },
      },
    },
    controllers.getMyInvitationsController.handle,
  );

  app.get(
    USERS_HTTP_PATHS.adminCollection,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.read,
        permission: {
          key: USERS_HTTP_PERMISSIONS.readAdmin,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "adminListUsers",
        security: USERS_HTTP_SECURITY,
        querystring: RequestAdminUsersListQuerySchema,
        response: {
          200: ResponseAdminUserListSchema,
          401: errorResponseDto,
          403: errorResponseDto,
        },
      },
    },
    controllers.adminListUsersController.handle,
  );

  app.get(
    USERS_HTTP_PATHS.adminItem,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.read,
        permission: {
          key: USERS_HTTP_PERMISSIONS.readAdmin,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "adminGetUserById",
        security: USERS_HTTP_SECURITY,
        params: RequestUserParamsSchema,
        response: {
          200: ResponseAdminUserSchema,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.adminGetUserByIdController.handle,
  );

  app.patch(
    USERS_HTTP_PATHS.adminItem,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.write,
        permission: {
          key: USERS_HTTP_PERMISSIONS.updateAdmin,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "adminUpdateUser",
        security: USERS_HTTP_SECURITY,
        params: RequestUserParamsSchema,
        body: AdminUpdateUserSchema,
        response: {
          200: ResponseAdminUserSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          403: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
          412: errorResponseDto,
        },
      },
    },
    controllers.adminUpdateUserController.handle,
  );

  app.delete(
    USERS_HTTP_PATHS.adminItem,
    {
      config: {
        rateLimit: USERS_HTTP_RATE_LIMITS.write,
        permission: {
          key: USERS_HTTP_PERMISSIONS.deleteAdmin,
        },
      },
      schema: {
        tags: ["Users"],
        operationId: "adminDeleteUser",
        security: USERS_HTTP_SECURITY,
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
    controllers.adminUpdateUserController.handleDelete,
  );

}
