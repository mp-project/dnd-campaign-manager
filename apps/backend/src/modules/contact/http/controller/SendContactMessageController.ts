import type { FastifyRequest } from "fastify";

import { AbstractController } from "#core/http/controller/AbstractController";
import { CreateContactMessageSchema } from "#src/modules/contact/domain/dto/CreateContactMessageDto";
import type { SendContactMessageUseCase } from "#src/modules/contact/useCase/SendContactMessageUseCase";

export class SendContactMessageController extends AbstractController {
  constructor(private readonly sendContactMessageUseCase: SendContactMessageUseCase) {
    super();
  }

  handle = async (request: FastifyRequest) =>
    this.execute(async () => {
      const body = CreateContactMessageSchema.parse(request.body);

      return this.sendContactMessageUseCase.execute(body);
    });
}
