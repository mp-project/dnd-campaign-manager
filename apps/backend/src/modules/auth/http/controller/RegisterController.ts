import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { RegisterSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RegisterUseCase } from "#src/modules/auth/useCase/RegisterUseCase";

export class RegisterController extends AbstractController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = RegisterSchema.parse(request.body);

      return this.registerUseCase.execute(body, this.http.clientMetadata(request));
    });
}
