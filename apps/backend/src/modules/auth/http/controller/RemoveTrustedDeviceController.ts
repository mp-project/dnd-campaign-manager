import type { FastifyReply, FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { TrustedDeviceParamsSchema } from "#src/modules/auth/domain/dto/RequestTrustedDeviceDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RemoveTrustedDeviceUseCase } from "#src/modules/auth/useCase/RemoveTrustedDeviceUseCase";

export class RemoveTrustedDeviceController extends AbstractController {
  constructor(
    private readonly removeTrustedDeviceUseCase: RemoveTrustedDeviceUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest, reply: FastifyReply) =>
    this.execute(async () => {
      const params = TrustedDeviceParamsSchema.parse(request.params);
      const result = await this.removeTrustedDeviceUseCase.execute(
        request.requestContext as RequestContext,
        params.deviceId,
        this.http.readTrustedDeviceToken(request),
      );

      if (result.current) {
        this.http.clearTrustedDeviceCookie(reply);
      }
    });
}
