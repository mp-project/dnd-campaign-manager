import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { LogoutSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { LogoutUseCase } from "#src/modules/auth/useCase/LogoutUseCase";

export class LogoutController extends AbstractController {
  constructor(
    private readonly logoutUseCase: LogoutUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = LogoutSchema.parse(request.body ?? {});

      await this.logoutUseCase.execute(body.refreshToken ?? this.http.readRefreshToken(request));

      this.http.clearSessionCookies(reply);
    });
}
