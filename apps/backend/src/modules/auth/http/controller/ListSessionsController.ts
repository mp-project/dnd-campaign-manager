import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import type { RequestContext } from "#core/http/requestContext";
import { AuthHttpSupport } from "#src/modules/auth/http/AuthHttpSupport";
import { ListSessionsUseCase } from "#src/modules/auth/useCase/ListSessionsUseCase";

export class ListSessionsController extends AbstractController {
  constructor(
    private readonly listSessionsUseCase: ListSessionsUseCase,
    private readonly http: AuthHttpSupport,
  ) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () =>
      this.listSessionsUseCase.execute(
        request.requestContext as RequestContext,
        this.http.readRefreshToken(request),
      ),
    );
}
