import type { FastifyInstance } from "fastify";

import { errorResponseDto } from "#core/http/dto";
import { SENSITIVE_ROUTE_RATE_LIMIT } from "#core/http/rateLimit";
import { ContactChallengeSchema } from "#src/modules/contact/domain/dto/ContactChallengeDto";
import { CreateContactMessageSchema } from "#src/modules/contact/domain/dto/CreateContactMessageDto";
import { ResponseContactMessageSchema } from "#src/modules/contact/domain/dto/ResponseContactMessageDto";
import type { IssueContactChallengeController } from "#src/modules/contact/http/controller/IssueContactChallengeController";
import type { SendContactMessageController } from "#src/modules/contact/http/controller/SendContactMessageController";

export type ContactRouteControllers = {
  issueContactChallengeController: IssueContactChallengeController;
  sendContactMessageController: SendContactMessageController;
};

const tags = ["Contact"];

export function registerContactRoutes(app: FastifyInstance, controllers: ContactRouteControllers): void {
  app.get(
    "/contact/challenge",
    {
      config: {
        public: "JS challenge of the contact form for visitors without an account",
      },
      schema: {
        tags,
        operationId: "issueContactChallenge",
        response: {
          200: ContactChallengeSchema,
          429: errorResponseDto,
        },
      },
    },
    async (_request, reply) => {
      const payload = await controllers.issueContactChallengeController.handle();

      // Every task counts once: never from a cache.
      return reply.header("cache-control", "no-store").send(payload);
    },
  );

  app.post(
    "/contact",
    {
      config: {
        // Sends an email, so it has the budget of the auth routes.
        rateLimit: SENSITIVE_ROUTE_RATE_LIMIT,
        public: "contact form for visitors without an account",
      },
      schema: {
        tags,
        operationId: "sendContactMessage",
        body: CreateContactMessageSchema,
        response: {
          202: ResponseContactMessageSchema,
          400: errorResponseDto,
          429: errorResponseDto,
          503: errorResponseDto,
        },
      },
    },
    async (request, reply) => {
      const payload = await controllers.sendContactMessageController.handle(request);

      return reply.code(202).send(payload);
    },
  );
}
