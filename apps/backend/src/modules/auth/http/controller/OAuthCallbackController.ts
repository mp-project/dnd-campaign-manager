import type { FastifyReply, FastifyRequest } from "fastify";

import { AppError } from "#core/error/AppError";
import { isDatabaseBusyError } from "#core/error/databaseBusy";
import { AbstractController } from "#core/http/controller/AbstractController";
import {
  OAuthCallbackParamsSchema,
  OAuthCallbackQuerySchema,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { OAuthCallbackUseCase } from "#src/modules/auth/useCase/OAuthCallbackUseCase";

/**
 * The browser arrives here from the provider, so every outcome is a redirect to the frontend's
 * OAuth page, never an error body: failures carry their code (`status=error&code=…`), which the
 * frontend translates, and the page the user started from. Application errors keep their code
 * (a busy database stays `SERVICE_UNAVAILABLE`); unexpected failures are logged and reported as
 * `OAUTH_CALLBACK_FAILED`.
 */
export class OAuthCallbackController extends AbstractController {
  constructor(
    private readonly oauthCallbackUseCase: OAuthCallbackUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = OAuthCallbackParamsSchema.parse(request.params);
    const query = OAuthCallbackQuerySchema.parse(request.query);
    const stateCookieValue = this.http.readOAuthState(request);
    const failed = (code: string) =>
      reply.redirect(
        this.http.frontendCallbackUrl("error", this.oauthCallbackUseCase.redirectPathOf(stateCookieValue), { code }),
      );

    this.http.clearOAuthStateCookie(reply);

    if (!query.code || !query.state) {
      // Cancelled or refused at the provider.
      return failed("OAUTH_CALLBACK_FAILED");
    }

    let result;
    try {
      result = await this.oauthCallbackUseCase.execute({
        provider: params.provider,
        code: query.code,
        state: query.state,
        stateCookieValue,
        metadata: this.http.clientMetadata(request),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return failed(error.code);
      }

      if (isDatabaseBusyError(error)) {
        return failed("SERVICE_UNAVAILABLE");
      }

      request.log.error({ err: error }, "OAuth callback failed");
      return failed("OAUTH_CALLBACK_FAILED");
    }

    if (result.type === "authenticated") {
      this.http.setSessionCookies(reply, result.session);
      this.http.clearOAuthOnboardingCookie(reply);

      return reply.redirect(this.http.frontendCallbackUrl("success", result.redirectPath));
    }

    this.http.setOAuthOnboardingCookie(
      reply,
      result.onboardingCookieValue,
      result.onboardingCookieTtlMs,
    );

    return reply.redirect(
      this.http.frontendCallbackUrl("registration_required", result.redirectPath),
    );
  };
}
