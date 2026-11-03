import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import {
  OAuthCallbackParamsSchema,
  OAuthCallbackQuerySchema,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { OAuthCallbackUseCase } from "#src/modules/auth/useCase/OAuthCallbackUseCase";

export class OAuthCallbackController extends AbstractController {
  constructor(
    private readonly oauthCallbackUseCase: OAuthCallbackUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const params = OAuthCallbackParamsSchema.parse(request.params);
      const query = OAuthCallbackQuerySchema.parse(request.query);

      const result = await this.oauthCallbackUseCase.execute({
        provider: params.provider,
        code: query.code,
        state: query.state,
        stateCookieValue: this.http.readOAuthState(request),
        metadata: this.http.clientMetadata(request),
      });

      this.http.clearOAuthStateCookie(reply);

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
    });
}
