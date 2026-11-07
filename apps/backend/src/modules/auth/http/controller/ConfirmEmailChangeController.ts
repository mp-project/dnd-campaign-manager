import type { FastifyRequest } from "fastify";

import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { ConfirmEmailChangeSchema } from "#src/modules/auth/domain/dto/EmailChangeDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { ConfirmEmailChangeUseCase } from "#src/modules/auth/useCase/ConfirmEmailChangeUseCase";

export class ConfirmEmailChangeController extends AbstractController {
  constructor(
    private readonly confirmEmailChangeUseCase: ConfirmEmailChangeUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = ConfirmEmailChangeSchema.parse(request.body);

      return this.confirmEmailChangeUseCase.execute(
        request.requestContext as RequestContext,
        body,
        this.http.clientMetadata(request),
      );
    });
}
