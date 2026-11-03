import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import {
  OAuthStartParamsSchema,
  OAuthStartQuerySchema,
} from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthError } from "#src/modules/auth/error/http/AuthError";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { StartOAuthUseCase } from "#src/modules/auth/useCase/StartOAuthUseCase";

export class StartOAuthController extends AbstractController {
  constructor(
    private readonly startOAuthUseCase: StartOAuthUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = OAuthStartParamsSchema.parse(request.params);
    const query = OAuthStartQuerySchema.parse(request.query);

    try {
      const start = await this.startOAuthUseCase.execute({
        provider: params.provider,
        intent: query.intent,
        redirectPath: query.redirect,
      });

      this.http.setOAuthStateCookie(reply, start.stateCookieValue, start.stateCookieTtlMs);

      return reply.redirect(start.authorizationUrl.toString());
    } catch (error) {
      if (error instanceof AuthError && error.code === "OAUTH_PROVIDER_UNAVAILABLE") {
        return reply.redirect(
          this.http.frontendCallbackUrl("error", query.redirect, {
            reason: "provider_unavailable",
            provider: params.provider,
            intent: query.intent,
          }),
        );
      }

      this.handleError(error);
    }
  };
}
