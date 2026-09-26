import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  LogoutSchema,
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
import { AuthService } from "#src/modules/auth/service/AuthService";
import {
  toAuthResponse,
  toEmailVerificationResponse,
  toRegisterUserResponse,
  toRegisterUserResponseFromResult,
} from "#src/modules/auth/http/controller/AuthResponseMapper";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import { parseCookieHeader, serializeCookie } from "#src/modules/auth/utils/cookies";

type AuthControllerOptions = {
  secureCookies: boolean;
  frontendOrigin: string;
};

const ACCESS_COOKIE_KEY = "access_token";
const REFRESH_COOKIE_KEY = "refresh_token";
const OAUTH_STATE_COOKIE_KEY = "oauth_state_ctx";
const OAUTH_ONBOARDING_COOKIE_KEY = "oauth_onboarding_ctx";

export class AuthController extends AbstractController {
  constructor(
    private readonly authService: AuthService,
    private readonly options: AuthControllerOptions,
  ) {
    super();
  }

  requestRegistrationVerification = async (
    request: FastifyRequest,
  ) =>
    this.execute(async () => {
      const body = RequestEmailVerificationSchema.parse(request.body);
      const verification = await this.authService.requestRegistrationVerification(body.email);

      return toEmailVerificationResponse(verification);
    });

  getRegistrationVerificationStatus = async (
    request: FastifyRequest,
  ) =>
    this.execute(async () => {
      const params = RequestEmailVerificationStatusParamsSchema.parse(request.params);
      const verification = await this.authService.getRegistrationVerificationStatus(
        params.verificationId,
      );

      return toEmailVerificationResponse(verification);
    });

  register = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = RegisterSchema.parse(request.body);
      const result = await this.authService.register(body);

      return toRegisterUserResponseFromResult(result);
    });

  verifyRegistrationEmail = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = VerifyEmailVerificationSchema.parse(request.body);
      const user = await this.authService.verifyRegistrationEmail(body);

      return toRegisterUserResponse({
        user,
        verificationId: body.verificationId,
        verificationCode: null,
      });
    });

  verifyRegistrationEmailByLink = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const query = VerifyEmailVerificationLinkQuerySchema.parse(request.query);
      const result = await this.authService.verifyRegistrationEmailByToken({
        token: query.token,
        metadata: {
          userAgent: request.headers["user-agent"],
          ip: request.ip,
        },
      });

      this.setSessionCookies(reply, result.session);

      return reply.redirect(this.buildFrontendRedirectUrl(result.redirectPath));
    });

  login = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = LoginSchema.parse(request.body);
      const session = await this.authService.login(body, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });

      this.setSessionCookies(reply, session);

      return toAuthResponse(session);
    });

  refresh = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = RefreshSchema.parse(request.body ?? {});
      const refreshToken =
        body.refreshToken ?? this.readCookie(request, REFRESH_COOKIE_KEY) ?? null;

      if (!refreshToken) {
        throw new AuthError("SESSION_INVALID", "Session is invalid");
      }

      const session = await this.authService.refresh(refreshToken, {
        userAgent: request.headers["user-agent"],
        ip: request.ip,
      });

      this.setSessionCookies(reply, session);

      return toAuthResponse(session);
    });

  logout = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = LogoutSchema.parse(request.body ?? {});
      const refreshToken =
        body.refreshToken ?? this.readCookie(request, REFRESH_COOKIE_KEY) ?? null;

      await this.authService.logoutCurrent(refreshToken);
      this.clearSessionCookies(reply);

      return null;
    });

  logoutAll = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const requestContext = request.requestContext as RequestContext;
      await this.authService.logoutAll(requestContext);
      this.clearSessionCookies(reply);

      return null;
    });

  forgotPassword = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = ForgotPasswordSchema.parse(request.body);
      await this.authService.requestPasswordReset(body);

      return {
        status: "accepted" as const,
      };
    });

  resetPassword = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = ResetPasswordSchema.parse(request.body);
      await this.authService.confirmPasswordReset(body);
      this.clearSessionCookies(reply);

      return null;
    });

  changePassword = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = ChangePasswordSchema.parse(request.body);
      const requestContext = request.requestContext as RequestContext;
      await this.authService.changePassword(requestContext, body);
      this.clearSessionCookies(reply);

      return null;
    });

  startOAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = OAuthStartParamsSchema.parse(request.params);
    const query = OAuthStartQuerySchema.parse(request.query);

    try {
      const start = await this.authService.startOAuth({
        provider: params.provider,
        intent: query.intent,
        redirectPath: query.redirect,
      });

      this.appendSetCookie(
        reply,
        serializeCookie(OAUTH_STATE_COOKIE_KEY, start.stateCookieValue, {
          maxAgeSeconds: Math.floor(start.stateCookieTtlMs / 1000),
          path: "/api/v1/auth/oauth",
          httpOnly: true,
          secure: this.options.secureCookies,
          sameSite: "Lax",
        }),
      );

      return reply.redirect(start.authorizationUrl.toString());
    } catch (error) {
      if (error instanceof AuthError && error.code === "OAUTH_PROVIDER_UNAVAILABLE") {
        return reply.redirect(
          this.buildFrontendCallbackUrl("error", query.redirect, {
            reason: "provider_unavailable",
            provider: params.provider,
            intent: query.intent,
          }),
        );
      }

      this.handleError(error);
    }
  };

  oauthCallback = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const params = OAuthCallbackParamsSchema.parse(request.params);
      const query = OAuthCallbackQuerySchema.parse(request.query);
      const stateCookieValue = this.readCookie(request, OAUTH_STATE_COOKIE_KEY);

      const result = await this.authService.completeOAuthCallback({
        provider: params.provider,
        code: query.code,
        state: query.state,
        stateCookieValue,
        metadata: {
          userAgent: request.headers["user-agent"],
          ip: request.ip,
        },
      });

      this.appendSetCookie(
        reply,
        serializeCookie(OAUTH_STATE_COOKIE_KEY, "", {
          maxAgeSeconds: 0,
          path: "/api/v1/auth/oauth",
          httpOnly: true,
          secure: this.options.secureCookies,
          sameSite: "Lax",
        }),
      );

      if (result.type === "authenticated") {
        this.setSessionCookies(reply, result.session);
        this.appendSetCookie(
          reply,
          serializeCookie(OAUTH_ONBOARDING_COOKIE_KEY, "", {
            maxAgeSeconds: 0,
            path: "/api/v1/auth/oauth",
            httpOnly: true,
            secure: this.options.secureCookies,
            sameSite: "Lax",
          }),
        );

        return reply.redirect(this.buildFrontendCallbackUrl("success", result.redirectPath));
      }

      this.appendSetCookie(
        reply,
        serializeCookie(OAUTH_ONBOARDING_COOKIE_KEY, result.onboardingCookieValue, {
          maxAgeSeconds: Math.floor(result.onboardingCookieTtlMs / 1000),
          path: "/api/v1/auth/oauth",
          httpOnly: true,
          secure: this.options.secureCookies,
          sameSite: "Lax",
        }),
      );

      return reply.redirect(
        this.buildFrontendCallbackUrl("registration_required", result.redirectPath),
      );
    });

  completeOAuthRegistration = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = OAuthCompleteRegistrationSchema.parse(request.body);
      const onboardingCookieValue = this.readCookie(request, OAUTH_ONBOARDING_COOKIE_KEY);
      const session = await this.authService.completeOAuthRegistration(
        body,
        onboardingCookieValue,
        {
          userAgent: request.headers["user-agent"],
          ip: request.ip,
        },
      );

      this.appendSetCookie(
        reply,
        serializeCookie(OAUTH_ONBOARDING_COOKIE_KEY, "", {
          maxAgeSeconds: 0,
          path: "/api/v1/auth/oauth",
          httpOnly: true,
          secure: this.options.secureCookies,
          sameSite: "Lax",
        }),
      );

      this.setSessionCookies(reply, session);

      return toAuthResponse(session);
    });

  private readCookie(request: FastifyRequest, key: string): string | null {
    const cookieHeader = request.headers.cookie;

    if (!cookieHeader) {
      return null;
    }

    return parseCookieHeader(cookieHeader).get(key) ?? null;
  }

  private setSessionCookies(
    reply: FastifyReply,
    session: {
      accessToken: string;
      accessExpiresAt: Date;
      refreshToken: string;
      refreshExpiresAt: Date;
    },
  ): void {
    const accessMaxAgeSeconds = Math.max(
      0,
      Math.floor((session.accessExpiresAt.getTime() - Date.now()) / 1000),
    );
    const refreshMaxAgeSeconds = Math.max(
      0,
      Math.floor((session.refreshExpiresAt.getTime() - Date.now()) / 1000),
    );

    this.appendSetCookie(
      reply,
      serializeCookie(ACCESS_COOKIE_KEY, session.accessToken, {
        maxAgeSeconds: accessMaxAgeSeconds,
        path: "/",
        httpOnly: true,
        secure: this.options.secureCookies,
        sameSite: "Lax",
      }),
    );

    this.appendSetCookie(
      reply,
      serializeCookie(REFRESH_COOKIE_KEY, session.refreshToken, {
        maxAgeSeconds: refreshMaxAgeSeconds,
        path: "/api/v1/auth",
        httpOnly: true,
        secure: this.options.secureCookies,
        sameSite: "Lax",
      }),
    );
  }

  private clearSessionCookies(reply: FastifyReply): void {
    this.appendSetCookie(
      reply,
      serializeCookie(ACCESS_COOKIE_KEY, "", {
        maxAgeSeconds: 0,
        path: "/",
        httpOnly: true,
        secure: this.options.secureCookies,
        sameSite: "Lax",
      }),
    );

    this.appendSetCookie(
      reply,
      serializeCookie(REFRESH_COOKIE_KEY, "", {
        maxAgeSeconds: 0,
        path: "/api/v1/auth",
        httpOnly: true,
        secure: this.options.secureCookies,
        sameSite: "Lax",
      }),
    );
  }

  private buildFrontendCallbackUrl(
    status: string,
    redirectPath: string,
    extraQuery?: Record<string, string>,
  ): string {
    const url = new URL("/auth/callback", this.options.frontendOrigin);
    url.searchParams.set("status", status);
    url.searchParams.set("redirect", redirectPath);

    if (extraQuery) {
      for (const [key, value] of Object.entries(extraQuery)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  private buildFrontendRedirectUrl(redirectPath: string): string {
    return new URL(redirectPath, this.options.frontendOrigin).toString();
  }

  private appendSetCookie(reply: FastifyReply, cookie: string): void {
    const existing = reply.getHeader("set-cookie");

    if (!existing) {
      reply.header("set-cookie", [cookie]);
      return;
    }

    if (Array.isArray(existing)) {
      reply.header("set-cookie", [...existing, cookie]);
      return;
    }

    reply.header("set-cookie", [String(existing), cookie]);
  }
}
