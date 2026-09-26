import { z } from "zod";
import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import {
  AUTH_HTTP_PATHS,
  AUTH_HTTP_RATE_LIMITS,
  AUTH_HTTP_SECURITY,
} from "#src/modules/auth/config/AuthHttpConfig";
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
  VerifyEmailVerificationSchema,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import {
  AcceptedResponseSchema,
  AuthResponseSchema,
  ResponseEmailVerificationSchema,
  ResponseRegisterUserSchema,
} from "#src/modules/auth/domain/dto/AuthResponseDto";
import { AuthController } from "#src/modules/auth/http/controller/AuthController";

export type AuthRouteControllers = {
  authController: AuthController;
};

export function registerAuthRoutes(
  app: FastifyInstance,
  controllers: AuthRouteControllers,
): void {
  app.post(
    AUTH_HTTP_PATHS.registerRequestVerification,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
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
      const payload = await controllers.authController.requestRegistrationVerification(
        request,
      );

      return reply.code(202).send(payload);
    },
  );

  app.get(
    AUTH_HTTP_PATHS.registerVerificationStatus,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.read,
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
    controllers.authController.getRegistrationVerificationStatus,
  );

  app.post(
    AUTH_HTTP_PATHS.register,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
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
      const payload = await controllers.authController.register(request);

      return reply.code(201).send(payload);
    },
  );

  app.post(
    AUTH_HTTP_PATHS.registerVerify,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
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
    controllers.authController.verifyRegistrationEmail,
  );

  app.post(
    AUTH_HTTP_PATHS.login,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
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
    controllers.authController.login,
  );

  app.post(
    AUTH_HTTP_PATHS.refresh,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
        operationId: "refresh",
        body: RefreshSchema,
        response: {
          200: AuthResponseSchema,
          400: errorResponseDto,
          401: errorResponseDto,
        },
      },
    },
    controllers.authController.refresh,
  );

  app.post(
    AUTH_HTTP_PATHS.logout,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.write,
        permission: {
          key: "auth.logoutSelf",
        },
      },
      schema: {
        tags: ["Auth"],
        operationId: "logout",
        security: AUTH_HTTP_SECURITY,
        body: RefreshSchema,
        response: {
          204: z.null(),
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.authController.logout(request, reply);
      return reply.code(204).send();
    },
  );

  app.post(
    AUTH_HTTP_PATHS.logoutAll,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.write,
        permission: {
          key: "auth.logoutAllSelf",
        },
      },
      schema: {
        tags: ["Auth"],
        operationId: "logoutAll",
        security: AUTH_HTTP_SECURITY,
        response: {
          204: z.null(),
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.authController.logoutAll(request, reply);
      return reply.code(204).send();
    },
  );

  app.post(
    AUTH_HTTP_PATHS.forgotPassword,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
        operationId: "forgotPassword",
        body: ForgotPasswordSchema,
        response: {
          202: AcceptedResponseSchema,
          400: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.authController.forgotPassword(request);
      return reply.code(202).send(payload);
    },
  );

  app.post(
    AUTH_HTTP_PATHS.resetPassword,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
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
      await controllers.authController.resetPassword(request, reply);
      return reply.code(204).send();
    },
  );

  app.post(
    AUTH_HTTP_PATHS.changePassword,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.write,
        permission: {
          key: "auth.changePasswordSelf",
        },
      },
      schema: {
        tags: ["Auth"],
        operationId: "changePassword",
        security: AUTH_HTTP_SECURITY,
        body: ChangePasswordSchema,
        response: {
          204: z.null(),
          400: errorResponseDto,
          401: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      await controllers.authController.changePassword(request, reply);
      return reply.code(204).send();
    },
  );

  app.get(
    AUTH_HTTP_PATHS.oauthStart,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
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
    controllers.authController.startOAuth,
  );

  app.get(
    AUTH_HTTP_PATHS.oauthCallback,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
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
    controllers.authController.oauthCallback,
  );

  app.post(
    AUTH_HTTP_PATHS.oauthCompleteRegistration,
    {
      config: {
        rateLimit: AUTH_HTTP_RATE_LIMITS.auth,
      },
      schema: {
        tags: ["Auth"],
        operationId: "completeOAuthRegistration",
        body: OAuthCompleteRegistrationSchema,
        response: {
          200: AuthResponseSchema,
          400: errorResponseDto,
          409: errorResponseDto,
        },
      },
    },
    controllers.authController.completeOAuthRegistration,
  );
}
