import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { ResponseClerkWebhookSchema } from "#src/modules/auth/domain/dto/ResponseClerkWebhookDto";
import type { HandleClerkWebhookController } from "#src/modules/auth/http/controller/HandleClerkWebhookController";

export type AuthRouteControllers = {
  handleClerkWebhookController: HandleClerkWebhookController;
};

const tags = ["Auth"];

export function registerAuthRoutes(app: FastifyInstance, controllers: AuthRouteControllers): void {
  app.register(async (webhookApp) => {
    // Only in this scope: the signature check needs the body exactly as Clerk sent it.
    webhookApp.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, body, done) => done(null, body),
    );

    webhookApp.post(
      "/webhooks/clerk",
      {
        config: {
          public: "Clerk webhook; the signature is checked",
        },
        schema: {
          tags,
          operationId: "handleClerkWebhook",
          response: {
            200: ResponseClerkWebhookSchema,
            400: errorResponseDto,
            429: errorResponseDto,
            503: errorResponseDto,
          },
        },
      },
      async (request) => controllers.handleClerkWebhookController.handle(request),
    );
  });
}
