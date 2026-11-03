import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { VerifyEmailVerificationSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { VerifyRegistrationEmailUseCase } from "#src/modules/auth/useCase/VerifyRegistrationEmailUseCase";

export class VerifyRegistrationEmailController extends AbstractController {
  constructor(
    private readonly verifyRegistrationEmailUseCase: VerifyRegistrationEmailUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = VerifyEmailVerificationSchema.parse(request.body);

      return this.verifyRegistrationEmailUseCase.execute(body, this.http.clientMetadata(request));
    });
}
