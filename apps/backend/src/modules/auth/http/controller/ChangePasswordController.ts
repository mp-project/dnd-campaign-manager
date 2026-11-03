import type { FastifyReply, FastifyRequest } from "fastify";

import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { ChangePasswordSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { ChangePasswordUseCase } from "#src/modules/auth/useCase/ChangePasswordUseCase";

export class ChangePasswordController extends AbstractController {
  constructor(
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = ChangePasswordSchema.parse(request.body);

      await this.changePasswordUseCase.execute(request.requestContext as RequestContext, body);

      this.http.clearSessionCookies(reply);
      this.http.clearTrustedDeviceCookie(reply);
    });
}
