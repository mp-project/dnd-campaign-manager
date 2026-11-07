import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { ConfirmEmailChangeLinkQuerySchema } from "#src/modules/auth/domain/dto/EmailChangeDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { ConfirmEmailChangeByLinkUseCase } from "#src/modules/auth/useCase/ConfirmEmailChangeByLinkUseCase";

export class ConfirmEmailChangeByLinkController extends AbstractController {
  constructor(
    private readonly confirmEmailChangeByLinkUseCase: ConfirmEmailChangeByLinkUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const query = ConfirmEmailChangeLinkQuerySchema.parse(request.query);
      const result = await this.confirmEmailChangeByLinkUseCase.execute(
        query.token,
        this.http.clientMetadata(request),
      );

      return reply.redirect(this.http.frontendRedirectUrl(result.redirectPath));
    });
}
