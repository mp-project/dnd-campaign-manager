import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { SENSITIVE_ROUTE_RATE_LIMIT } from "#core/http/rateLimit";
import { AUTH_PERMISSIONS } from "#src/modules/auth/permissions/AuthPermissions";
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  OAuthCallbackParamsSchema,
  OAuthCallbackQuerySchema,
  OAuthCompleteRegistrationSchema,
  OAuthStartParamsSchema,
  OAuthStartQuerySchema,
  RefreshSchema,
  RegisterSchema,
  RequestEmailVerificationSchema,
  RequestEmailVerificationStatusParamsSchema,
  ResetPasswordSchema,
  VerifyEmailVerificationLinkQuerySchema,
  VerifyEmailVerificationSchema,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  AcceptedResponseSchema,
  AuthResponseSchema,
  ResponseEmailVerificationSchema,
  ResponseRegisterUserSchema,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import { RequestRegistrationVerificationController } from "#src/modules/auth/http/controller/RequestRegistrationVerificationController";
import { GetRegistrationVerificationStatusController } from "#src/modules/auth/http/controller/GetRegistrationVerificationStatusController";
import { RegisterController } from "#src/modules/auth/http/controller/RegisterController";
import { VerifyRegistrationEmailByLinkController } from "#src/modules/auth/http/controller/VerifyRegistrationEmailByLinkController";
import { VerifyRegistrationEmailController } from "#src/modules/auth/http/controller/VerifyRegistrationEmailController";
import { LoginController } from "#src/modules/auth/http/controller/LoginController";
import { RefreshController } from "#src/modules/auth/http/controller/RefreshController";
import { LogoutAllController } from "#src/modules/auth/http/controller/LogoutAllController";
import { LogoutController } from "#src/modules/auth/http/controller/LogoutController";
import { ForgotPasswordController } from "#src/modules/auth/http/controller/ForgotPasswordController";
import { ResetPasswordController } from "#src/modules/auth/http/controller/ResetPasswordController";
import { ChangePasswordController } from "#src/modules/auth/http/controller/ChangePasswordController";
import { TrustCurrentDeviceController } from "#src/modules/auth/http/controller/TrustCurrentDeviceController";
import { RemoveCurrentDeviceController } from "#src/modules/auth/http/controller/RemoveCurrentDeviceController";
import { StartOAuthController } from "#src/modules/auth/http/controller/StartOAuthController";
import { OAuthCallbackController } from "#src/modules/auth/http/controller/OAuthCallbackController";
import { CompleteOAuthRegistrationController } from "#src/modules/auth/http/controller/CompleteOAuthRegistrationController";

export type AuthRouteControllers = {
  requestRegistrationVerificationController: RequestRegistrationVerificationController;
  getRegistrationVerificationStatusController: GetRegistrationVerificationStatusController;
  registerController: RegisterController;
  verifyRegistrationEmailByLinkController: VerifyRegistrationEmailByLinkController;
  verifyRegistrationEmailController: VerifyRegistrationEmailController;
  loginController: LoginController;
  refreshController: RefreshController;
  logoutAllController: LogoutAllController;
  logoutController: LogoutController;
  forgotPasswordController: ForgotPasswordController;
  resetPasswordController: ResetPasswordController;
  changePasswordController: ChangePasswordController;
  trustCurrentDeviceController: TrustCurrentDeviceController;
  removeCurrentDeviceController: RemoveCurrentDeviceController;
  startOAuthController: StartOAuthController;
  oauthCallbackController: OAuthCallbackController;
  completeOAuthRegistrationController: CompleteOAuthRegistrationController;
};

const tags = ["Auth"];
const security = [{ cookieAuth: [] }, { bearerAuth: [] }] as const;

export function registerAuthRoutes(
  app: FastifyInstance,
  controllers: AuthRouteControllers,
): void {
  app.post(
    "/auth/register/request-verification",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
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
      const payload = await controllers.requestRegistrationVerificationController.handle(request);

      return reply.code(202).send(payload);
    },
  );

  app.get(
    "/auth/register/verification/:verificationId/status",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "getRegistrationVerificationStatus",
        params: RequestEmailVerificationStatusParamsSchema,
        response: {
          200: ResponseEmailVerificationSchema,
          400: errorResponseDto,
          404: errorResponseDto,
        },
      },
    },
    controllers.getRegistrationVerificationStatusController.handle,
  );

  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "registerUser",
        body: RegisterSchema,
        response: {
          201: ResponseRegisterUserSchema,
          400: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.registerController.handle(request);

      return reply.code(201).send(payload);
    },
  );

  app.post(
    "/auth/register/verify-email",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
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
    controllers.verifyRegistrationEmailController.handle,
  );

  app.get(
    "/auth/register/verify-email-link",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "verifyRegistrationEmailByLink",
        querystring: VerifyEmailVerificationLinkQuerySchema,
        response: {
          302: z.null(),
          400: errorResponseDto,
          404: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.verifyRegistrationEmailByLinkController.handle,
  );

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "login",
        body: LoginSchema,
        response: {
          200: AuthResponseSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.loginController.handle,
  );

  app.post(
    "/auth/refresh",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "refresh",
        body: RefreshSchema,
        response: {
          200: AuthResponseSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.refreshController.handle,
  );

  app.post(
    "/auth/logout",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        permission: { key: AUTH_PERMISSIONS.logoutSelf },
      },
      schema: {
        tags,
        operationId: "logout",
        security,
        body: RefreshSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.logoutController.handle(request, reply);
      return reply.code(204).send();
    },
  );

  app.post(
    "/auth/logout-all",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        permission: { key: AUTH_PERMISSIONS.logoutAllSelf },
      },
      schema: {
        tags,
        operationId: "logoutAll",
        security,
        response: {
          204: z.null(),
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.logoutAllController.handle(request, reply);
      return reply.code(204).send();
    },
  );

  app.post(
    "/auth/forgot-password",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "forgotPassword",
        body: ForgotPasswordSchema,
        response: {
          202: AcceptedResponseSchema,
          400: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.forgotPasswordController.handle(request);
      return reply.code(202).send(payload);
    },
  );

  app.post(
    "/auth/reset-password",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "resetPassword",
        body: ResetPasswordSchema,
        response: {
          204: z.null(),
          400: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.resetPasswordController.handle(request, reply);
      return reply.code(204).send();
    },
  );

  app.post(
    "/me/change-password",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        permission: { key: AUTH_PERMISSIONS.changePasswordSelf },
      },
      schema: {
        tags,
        operationId: "changePassword",
        security,
        body: ChangePasswordSchema,
        response: {
          204: z.null(),
          400: errorResponseDto,
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.changePasswordController.handle(request, reply);
      return reply.code(204).send();
    },
  );

  app.post(
    "/me/trusted-device",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        permission: { key: AUTH_PERMISSIONS.trustDeviceSelf },
      },
      schema: {
        tags,
        operationId: "trustCurrentDevice",
        security,
        response: {
          204: z.null(),
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.trustCurrentDeviceController.handle(request, reply);
      return reply.code(204).send();
    },
  );

  app.delete(
    "/me/trusted-device",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        permission: { key: AUTH_PERMISSIONS.trustDeviceSelf },
      },
      schema: {
        tags,
        operationId: "removeCurrentDevice",
        security,
        response: {
          204: z.null(),
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.removeCurrentDeviceController.handle(request, reply);
      return reply.code(204).send();
    },
  );

  app.get(
    "/auth/oauth/:provider/start",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "startOAuth",
        params: OAuthStartParamsSchema,
        querystring: OAuthStartQuerySchema,
        response: {
          302: z.null(),
          400: errorResponseDto,
          401: errorResponseDto,
          503: errorResponseDto,
        },
      },
    },
    controllers.startOAuthController.handle,
  );

  app.get(
    "/auth/oauth/:provider/callback",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "oauthCallback",
        params: OAuthCallbackParamsSchema,
        querystring: OAuthCallbackQuerySchema,
        response: {
          302: z.null(),
          400: errorResponseDto,
          401: errorResponseDto,
          409: errorResponseDto,
          503: errorResponseDto,
        },
      },
    },
    controllers.oauthCallbackController.handle,
  );

  app.post(
    "/auth/oauth/complete-registration",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
      },
      schema: {
        tags,
        operationId: "completeOAuthRegistration",
        body: OAuthCompleteRegistrationSchema,
        response: {
          200: AuthResponseSchema,
          400: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.completeOAuthRegistrationController.handle,
  );
}
