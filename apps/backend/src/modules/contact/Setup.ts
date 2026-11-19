import type { FastifyInstance } from "fastify";

import type { AppContainer } from "#core/app/container";
import type { AppModule } from "#core/app/moduleSystem";
import { IssueContactChallengeController } from "#src/modules/contact/http/controller/IssueContactChallengeController";
import { SendContactMessageController } from "#src/modules/contact/http/controller/SendContactMessageController";
import { registerContactRoutes } from "#src/modules/contact/http/routes/v1/ContactRoutes";
import { ContactChallengeService } from "#src/modules/contact/service/ContactChallengeService";
import { IssueContactChallengeUseCase } from "#src/modules/contact/useCase/IssueContactChallengeUseCase";
import { SendContactMessageUseCase } from "#src/modules/contact/useCase/SendContactMessageUseCase";

/**
 * The contact form of the public pages: `GET /contact/challenge` hands out the JS challenge,
 * `POST /contact` checks its solution and sends the message by email to `CONTACT_EMAIL_TO`.
 * No table and no permission: open to everybody, the message limited like the auth routes.
 */
async function registerContactModule(app: FastifyInstance, container: AppContainer): Promise<void> {
  const challenges = new ContactChallengeService(container.config.CONTACT_CHALLENGE_SECRET);
  const sendContactMessageUseCase = new SendContactMessageUseCase(
    challenges,
    container.ports.emailPort,
    container.config.CONTACT_EMAIL_TO,
  );

  app.register(async (contactApp) => {
    registerContactRoutes(contactApp, {
      issueContactChallengeController: new IssueContactChallengeController(new IssueContactChallengeUseCase(challenges)),
      sendContactMessageController: new SendContactMessageController(sendContactMessageUseCase),
    });
  });
}

export const contactModule: AppModule = {
  name: "contact",
  dependencies: [],
  register: registerContactModule,
};
