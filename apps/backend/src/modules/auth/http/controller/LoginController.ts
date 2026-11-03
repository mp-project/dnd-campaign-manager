import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { LoginSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { LoginUseCase } from "#src/modules/auth/useCase/LoginUseCase";

export class LoginController extends AbstractController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const body = LoginSchema.parse(request.body);
      const { session, trustedDevice, response } = await this.loginUseCase.execute(
        body,
        this.http.clientMetadata(request),
        this.http.readTrustedDeviceToken(request),
      );

      this.http.setSessionCookies(reply, session);

      if (trustedDevice) {
        this.http.setTrustedDeviceCookie(reply, trustedDevice);
      }

      return response;
    });
}
