import nodemailer from "nodemailer";

import type { EmailPort } from "#core/email/port";

type SmtpEmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  fromAddress: string;
  fromName: string;
  username?: string;
  password?: string;
};

function formatFromAddress(name: string, address: string): string {
  return `${name} <${address}>`;
}

export function createSmtpEmailPort(config: SmtpEmailConfig): EmailPort {
  const transportOptions: {
    host: string;
    port: number;
    secure: boolean;
    auth?: {
      user: string;
      pass: string;
    };
  } = {
    host: config.host,
    port: config.port,
    secure: config.secure,
  };

  if (config.username && config.password) {
    transportOptions.auth = {
      user: config.username,
      pass: config.password,
    };
  }

  const transporter = nodemailer.createTransport(transportOptions);
  const from = formatFromAddress(config.fromName, config.fromAddress);

  return {
    async send(message) {
      await transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
