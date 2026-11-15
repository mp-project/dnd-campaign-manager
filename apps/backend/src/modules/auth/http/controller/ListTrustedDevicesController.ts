import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { ListTrustedDevicesUseCase } from "#src/modules/auth/useCase/ListTrustedDevicesUseCase";

export class ListTrustedDevicesController extends AbstractController {
  constructor(
    private readonly listTrustedDevicesUseCase: ListTrustedDevicesUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () =>
      this.listTrustedDevicesUseCase.execute(
        request.requestContext as RequestContext,
        this.http.readTrustedDeviceToken(request),
      ),
    );
}
