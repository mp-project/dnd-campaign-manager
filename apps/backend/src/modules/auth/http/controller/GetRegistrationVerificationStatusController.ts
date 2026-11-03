import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestEmailVerificationStatusParamsSchema } from "#src/modules/auth/domain/dto/AuthRequestDto";
import { GetRegistrationVerificationStatusUseCase } from "#src/modules/auth/useCase/GetRegistrationVerificationStatusUseCase";

export class GetRegistrationVerificationStatusController extends AbstractController {
  constructor(
    private readonly getRegistrationVerificationStatusUseCase: GetRegistrationVerificationStatusUseCase,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const params = RequestEmailVerificationStatusParamsSchema.parse(request.params);

      return this.getRegistrationVerificationStatusUseCase.execute(params.verificationId);
    });
}
