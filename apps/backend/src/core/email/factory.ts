import type { AppEnv } from "#core/env";
import { createNoopEmailPort } from "#core/email/noopEmail";
import type { EmailPort } from "#core/email/port";
import { createSmtpEmailPort } from "#core/email/smtpEmail";

export function createEmailPortFromEnv(env: AppEnv): EmailPort {
  if (env.MAIL_DRIVER === "noop") {
    return createNoopEmailPort();
  }

  const smtpConfig: {
    host: string;
    port: number;
    secure: boolean;
    fromAddress: string;
    fromName: string;
    username?: string;
    password?: string;
  } = {
    host: env.MAIL_SMTP_HOST,
    port: env.MAIL_SMTP_PORT,
    secure: env.MAIL_SMTP_SECURE,
    fromAddress: env.MAIL_FROM_ADDRESS,
    fromName: env.MAIL_FROM_NAME,
  };

  if (env.MAIL_SMTP_USER && env.MAIL_SMTP_PASS) {
    smtpConfig.username = env.MAIL_SMTP_USER;
    smtpConfig.password = env.MAIL_SMTP_PASS;
  }

  return createSmtpEmailPort(smtpConfig);
}
