import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { OAuthCompleteRegistrationSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { CompleteOAuthRegistrationUseCase } from "#src/modules/auth/useCase/CompleteOAuthRegistrationUseCase";

export class CompleteOAuthRegistrationController extends AbstractController {
  constructor(
    private readonly completeOAuthRegistrationUseCase: CompleteOAuthRegistrationUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = OAuthCompleteRegistrationSchema.parse(request.body);
      const { session, response } = await this.completeOAuthRegistrationUseCase.execute(
        body,
        this.http.readOAuthOnboarding(request),
        this.http.clientMetadata(request),
      );

      this.http.clearOAuthOnboardingCookie(reply);
      this.http.setSessionCookies(reply, session);

      return response;
    });
}
