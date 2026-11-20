import type { EmailMessage, EmailPort } from "#core/email/port";
import { contextLogger } from "#core/log/logContext";
import { maskEmail } from "#core/log/mask";

/** `MAIL_DRIVER=noop`: nothing is sent; a debug line says what would have been. */
export function createNoopEmailPort(): EmailPort {
  return {
    async send(message: EmailMessage): Promise<void> {
      contextLogger()?.debug(
        { kind: "mail", purpose: message.purpose, to: maskEmail(message.to) },
        "mail.skipped",
      );
    },
  };
}
