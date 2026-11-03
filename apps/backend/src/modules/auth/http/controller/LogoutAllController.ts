import type { FastifyReply, FastifyRequest } from "fastify";

import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { LogoutAllUseCase } from "#src/modules/auth/useCase/LogoutAllUseCase";

export class LogoutAllController extends AbstractController {
  constructor(
    private readonly logoutAllUseCase: LogoutAllUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      await this.logoutAllUseCase.execute(request.requestContext as RequestContext);

      this.http.clearSessionCookies(reply);
      this.http.clearTrustedDeviceCookie(reply);
    });
}
