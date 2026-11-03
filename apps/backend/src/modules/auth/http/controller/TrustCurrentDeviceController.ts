import type { FastifyReply, FastifyRequest } from "fastify";

import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { TrustCurrentDeviceUseCase } from "#src/modules/auth/useCase/TrustCurrentDeviceUseCase";

export class TrustCurrentDeviceController extends AbstractController {
  constructor(
    private readonly trustCurrentDeviceUseCase: TrustCurrentDeviceUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const device = await this.trustCurrentDeviceUseCase.execute(
        request.requestContext as RequestContext,
        this.http.clientMetadata(request),
        this.http.readTrustedDeviceToken(request),
      );

      this.http.setTrustedDeviceCookie(reply, device);
    });
}
