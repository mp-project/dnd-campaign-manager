import type { FastifyReply, FastifyRequest } from "fastify";

import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RemoveCurrentDeviceUseCase } from "#src/modules/auth/useCase/RemoveCurrentDeviceUseCase";

export class RemoveCurrentDeviceController extends AbstractController {
  constructor(
    private readonly removeCurrentDeviceUseCase: RemoveCurrentDeviceUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      await this.removeCurrentDeviceUseCase.execute(
        request.requestContext as RequestContext,
        this.http.readTrustedDeviceToken(request),
      );

      this.http.clearTrustedDeviceCookie(reply);
    });
}
