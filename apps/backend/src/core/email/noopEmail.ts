import type { EmailMessage, EmailPort } from "#core/email/port";

export function createNoopEmailPort(): EmailPort {
  return {
    async send(_message: EmailMessage): Promise<void> {
      return;
    },
  };
}
