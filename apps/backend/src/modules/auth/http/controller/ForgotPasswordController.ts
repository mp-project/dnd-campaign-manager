import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { ForgotPasswordSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { ForgotPasswordUseCase } from "#src/modules/auth/useCase/ForgotPasswordUseCase";

export class ForgotPasswordController extends AbstractController {
  constructor(
    private readonly forgotPasswordUseCase: ForgotPasswordUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = ForgotPasswordSchema.parse(request.body);

      return this.forgotPasswordUseCase.execute(body, this.http.clientMetadata(request));
    });
}
