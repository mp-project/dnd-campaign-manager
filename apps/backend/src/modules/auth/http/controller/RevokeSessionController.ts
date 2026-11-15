import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { SessionParamsSchema } from "#src/modules/auth/domain/dto/RequestSessionDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RevokeSessionUseCase } from "#src/modules/auth/useCase/RevokeSessionUseCase";

export class RevokeSessionController extends AbstractController {
  constructor(
    private readonly revokeSessionUseCase: RevokeSessionUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const params = SessionParamsSchema.parse(request.params);
      const result = await this.revokeSessionUseCase.execute(
        request.requestContext as RequestContext,
        params.sessionId,
        this.http.readRefreshToken(request),
      );

      // Ending the own session is signing out.
      if (result.current) {
        this.http.clearSessionCookies(reply);
      }
    });
}
