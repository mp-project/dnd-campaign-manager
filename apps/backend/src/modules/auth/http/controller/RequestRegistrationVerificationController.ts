import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestEmailVerificationSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RequestRegistrationVerificationUseCase } from "#src/modules/auth/useCase/RequestRegistrationVerificationUseCase";

export class RequestRegistrationVerificationController extends AbstractController {
  constructor(
    private readonly requestRegistrationVerificationUseCase: RequestRegistrationVerificationUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = RequestEmailVerificationSchema.parse(request.body);

      return this.requestRegistrationVerificationUseCase.execute(
        body.email,
        this.http.clientMetadata(request),
      );
    });
}
