import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { RefreshSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RefreshUseCase } from "#src/modules/auth/useCase/RefreshUseCase";

export class RefreshController extends AbstractController {
  constructor(
    private readonly refreshUseCase: RefreshUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = RefreshSchema.parse(request.body ?? {});
      const { session, response } = await this.refreshUseCase.execute(
        body.refreshToken ?? this.http.readRefreshToken(request),
        this.http.clientMetadata(request),
      );

      this.http.setSessionCookies(reply, session);

      return response;
    });
}
