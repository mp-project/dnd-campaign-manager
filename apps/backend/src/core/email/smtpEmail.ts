import nodemailer from "nodemailer";

import type { EmailPort } from "#core/email/port";
import { ServiceUnavailableError } from "#core/error/http/index";
import { contextLogger } from "#core/log/logContext";
import { maskEmail } from "#core/log/mask";

type SmtpEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  fromAddress: string;
  fromName: string;
  /** Used when a message sets no `replyTo` of its own. */
  replyTo?: string;
  username?: string;
  password?: string;
};

/**
 * A hanging mail server must not hold a request: each step has a time limit, and the request then
 * fails with 503. One connection per mail on purpose: with nodemailer's `pool`, a server that
 * drops connections makes `sendMail` wait forever. The app sends few mails, so that costs little.
 */
const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
} as const;

function formatFromAddress(name: string, address: string): string {
  return `${name} <${address}>`;
}

export function createSmtpEmailPort(config: SmtpEmailConfig): EmailPort {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...SMTP_TIMEOUTS,
    ...(config.username && config.password
      ? { auth: { user: config.username, pass: config.password } }
      : {}),
  });
  const from = formatFromAddress(config.fromName, config.fromAddress);

  return {
    async send(message) {
      const replyTo = message.replyTo ?? config.replyTo;
      let messageId: string;

      try {
        const info = await transporter.sendMail({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(replyTo ? { replyTo } : {}),
        });

        messageId = info.messageId;
      } catch (error) {
        throw new ServiceUnavailableError("Email could not be sent", undefined, { cause: error });
      }

      contextLogger()?.info(
        { kind: "mail", purpose: message.purpose, to: maskEmail(message.to), messageId },
        "mail.sent",
      );
    },
  };
}
