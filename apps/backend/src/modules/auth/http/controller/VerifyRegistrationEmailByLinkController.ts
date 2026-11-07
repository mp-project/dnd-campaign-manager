import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { VerifyEmailVerificationLinkQuerySchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { VerifyRegistrationEmailByLinkUseCase } from "#src/modules/auth/useCase/VerifyRegistrationEmailByLinkUseCase";

export class VerifyRegistrationEmailByLinkController extends AbstractController {
  constructor(
    private readonly verifyRegistrationEmailByLinkUseCase: VerifyRegistrationEmailByLinkUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const query = VerifyEmailVerificationLinkQuerySchema.parse(request.query);
      const result = await this.verifyRegistrationEmailByLinkUseCase.execute(
        query.token,
        this.http.clientMetadata(request),
      );

      return reply.redirect(this.http.frontendRedirectUrl(result.redirectPath));
    });
}
