import type { EmailPort } from "#core/email/port";
import { ServiceUnavailableError, ValidationError } from "#core/error/http/index";
import type { CreateContactMessageDto } from "#src/modules/contact/domain/dto/CreateContactMessageDto";
import type { ResponseContactMessageDto } from "#src/modules/contact/domain/dto/ResponseContactMessageDto";
import { renderContactMessageEmail } from "#src/modules/contact/email/ContactMessageEmailTemplate";
import type { ContactChallengeService } from "#src/modules/contact/service/ContactChallengeService";

/**
 * Sends a message of the contact form to `recipient` (`CONTACT_EMAIL_TO`), with the sender as
 * reply address. Nothing is stored. Without a recipient or email port the form is unavailable
 * (503). The JS challenge must be solved (400 with `details.challenge` otherwise: `invalid`,
 * `expired`, `tooFast`, `used`); a filled honeypot is then accepted without sending, so bots learn
 * nothing.
 */
export class SendContactMessageUseCase {
  constructor(
    private readonly challenges: ContactChallengeService,
    private readonly emailPort: EmailPort | undefined,
    private readonly recipient: string | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: CreateContactMessageDto): Promise<ResponseContactMessageDto> {
    if (!this.emailPort || !this.recipient) {
      throw new ServiceUnavailableError("Contact form unavailable");
    }

    const challenge = await this.challenges.check(input.challenge);
    if (challenge !== "ok") {
      throw new ValidationError("Contact challenge not solved", { challenge });
    }

    if (input.website?.trim()) {
      return { status: "accepted" };
    }

    const email = renderContactMessageEmail({ ...input, receivedAt: this.now() });
    await this.emailPort.send({
      purpose: "contact",
      to: this.recipient,
      replyTo: input.email,
      ...email,
    });

    return { status: "accepted" };
  }
}
