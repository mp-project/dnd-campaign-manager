import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { ResetPasswordSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { ResetPasswordUseCase } from "#src/modules/auth/useCase/ResetPasswordUseCase";

export class ResetPasswordController extends AbstractController {
  constructor(
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = ResetPasswordSchema.parse(request.body);
      const device = await this.resetPasswordUseCase.execute(body, this.http.clientMetadata(request));

      this.http.clearSessionCookies(reply);

      if (device) {
        this.http.setTrustedDeviceCookie(reply, device);
      } else {
        this.http.clearTrustedDeviceCookie(reply);
      }
    });
}
