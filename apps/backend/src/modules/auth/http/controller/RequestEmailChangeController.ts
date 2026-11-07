import type { FastifyRequest } from "fastify";

import type { RequestContext } from "#core/http/requestContext";
import { AbstractController } from "#core/http/controller/AbstractController";
import { RequestEmailChangeSchema } from "#src/modules/auth/domain/dto/EmailChangeDto";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { RequestEmailChangeUseCase } from "#src/modules/auth/useCase/RequestEmailChangeUseCase";

export class RequestEmailChangeController extends AbstractController {
  constructor(
    private readonly requestEmailChangeUseCase: RequestEmailChangeUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = RequestEmailChangeSchema.parse(request.body);

      return this.requestEmailChangeUseCase.execute(
        request.requestContext as RequestContext,
        body,
        this.http.clientMetadata(request),
      );
    });
}
