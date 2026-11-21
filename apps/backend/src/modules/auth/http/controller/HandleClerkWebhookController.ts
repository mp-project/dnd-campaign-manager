import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import type { HandleClerkWebhookUseCase } from "#src/modules/auth/useCase/HandleClerkWebhookUseCase";

export class HandleClerkWebhookController extends AbstractController {
  constructor(private readonly handleClerkWebhookUseCase: HandleClerkWebhookUseCase) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () =>
      this.handleClerkWebhookUseCase.execute({
        // The signature covers the bytes as sent; the route keeps the body unparsed.
        rawBody: typeof request.body === "string" ? request.body : "",
        headers: request.headers,
      }),
    );
}
