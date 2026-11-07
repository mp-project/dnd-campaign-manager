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
  ResetPasswordSchema,
  VerifyEmailVerificationLinkQuerySchema,
  VerifyEmailVerificationSchema,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  AcceptedResponseSchema,
  AuthResponseSchema,
  AuthUserProfileSchema,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import {
  ConfirmEmailChangeLinkQuerySchema,
  ConfirmEmailChangeSchema,
  RequestEmailChangeSchema,
  ResponseEmailChangeRequestSchema,
} from "#src/modules/auth/domain/dto/EmailChangeDto";
import { ConfirmEmailChangeByLinkController } from "#src/modules/auth/http/controller/ConfirmEmailChangeByLinkController";
import { ConfirmEmailChangeController } from "#src/modules/auth/http/controller/ConfirmEmailChangeController";
import { RequestEmailChangeController } from "#src/modules/auth/http/controller/RequestEmailChangeController";
import { RequestRegistrationVerificationController } from "#src/modules/auth/http/controller/RequestRegistrationVerificationController";
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
  requestEmailChangeController: RequestEmailChangeController;
  confirmEmailChangeController: ConfirmEmailChangeController;
  confirmEmailChangeByLinkController: ConfirmEmailChangeByLinkController;
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
        public: "registration",
      },
      schema: {
        tags,
        operationId: "requestRegistrationVerification",
        body: RequestEmailVerificationSchema,
        response: {
          202: AcceptedResponseSchema,
          400: errorResponseDto,
          429: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.requestRegistrationVerificationController.handle(request);

      return reply.code(202).send(payload);
    },
  );

  app.post(
    "/auth/register",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        public: "registration",
      },
      schema: {
        tags,
        operationId: "registerUser",
        body: RegisterSchema,
        response: {
          202: AcceptedResponseSchema,
          400: errorResponseDto,
          429: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.registerController.handle(request);

      return reply.code(202).send(payload);
    },
  );

  app.post(
    "/auth/register/verify-email",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        public: "registration; the code proves the mailbox",
      },
      schema: {
        tags,
        operationId: "verifyRegistrationEmail",
        body: VerifyEmailVerificationSchema,
        response: {
          200: AuthUserProfileSchema,
          400: errorResponseDto,
          409: errorResponseDto,
          429: errorResponseDto,
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
        public: "registration; the signed link proves the mailbox",
      },
      schema: {
        tags,
        operationId: "verifyRegistrationEmailByLink",
        querystring: VerifyEmailVerificationLinkQuerySchema,
        response: {
          302: z.null(),
          400: errorResponseDto,
          429: errorResponseDto,
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
        public: "sign-in",
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
        public: "sign-in; the refresh token is the credential",
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
        public: "password reset",
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
        public: "password reset; the reset token is the credential",
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
        public: "OAuth sign-in",
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
        public: "OAuth sign-in; the signed state is the credential",
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
        public: "OAuth sign-in; the signed onboarding cookie is the credential",
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

  app.post(
    "/me/email-change",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        permission: { key: AUTH_PERMISSIONS.changeEmailSelf },
      },
      schema: {
        tags,
        operationId: "requestEmailChange",
        security,
        body: RequestEmailChangeSchema,
        response: {
          202: ResponseEmailChangeRequestSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          409: errorResponseDto,
          429: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.requestEmailChangeController.handle(request);
      return reply.code(202).send(payload);
    },
  );

  app.post(
    "/me/email-change/confirm",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        permission: { key: AUTH_PERMISSIONS.changeEmailSelf },
      },
      schema: {
        tags,
        operationId: "confirmEmailChange",
        security,
        body: ConfirmEmailChangeSchema,
        response: {
          200: AuthUserProfileSchema,
          400: errorResponseDto,
          401: errorResponseDto,
          409: errorResponseDto,
          429: errorResponseDto,
        },
      },
    },
    controllers.confirmEmailChangeController.handle,
  );

  app.get(
    "/auth/email-change/confirm-link",
    {
      config: {
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        public: "the signed link proves the mailbox",
      },
      schema: {
        tags,
        operationId: "confirmEmailChangeByLink",
        querystring: ConfirmEmailChangeLinkQuerySchema,
        response: {
          302: z.null(),
          400: errorResponseDto,
          409: errorResponseDto,
          429: errorResponseDto,
        },
      },
    },
    controllers.confirmEmailChangeByLinkController.handle,
  );
}
