import { z } from "zod";

import { createEmailPortFromEnv } from "#core/email/index";
import { getEnv } from "#core/env";
import { maskEmail } from "#core/log/mask";
import { runScript } from "#core/log/processErrors";
import { createScriptLogger } from "#core/log/scriptLogger";

const logger = createScriptLogger("mail-check");

/**
 * Sends a test mail with the settings of the current environment, like the server would:
 * `npm run mail:check --workspace @dnd/backend -- <recipient>`.
 */
async function runCheck(recipient: string | undefined): Promise<void> {
  const to = z.string().email().safeParse(recipient);

  if (!to.success) {
    throw new Error("Usage: npm run mail:check --workspace @dnd/backend -- <recipient>");
  }

  const env = getEnv();

  if (env.MAIL_DRIVER === "noop") {
    throw new Error("MAIL_DRIVER is noop; nothing would be sent");
  }

  logger.info(
    {
      host: env.MAIL_SMTP_HOST,
      port: env.MAIL_SMTP_PORT,
      secure: env.MAIL_SMTP_SECURE,
      from: env.MAIL_FROM_ADDRESS,
      replyTo: env.MAIL_REPLY_TO ?? null,
      to: maskEmail(to.data),
    },
    "Sending a test mail",
  );

  await createEmailPortFromEnv(env).send({
    purpose: "mail.check",
    to: to.data,
    subject: "Testmail / test mail",
    text: [
      "Diese Mail kommt von `npm run mail:check`: Der Versand der App funktioniert.",
      "This mail comes from `npm run mail:check`: the app can send mail.",
      "",
      `Absender / sender: ${env.MAIL_FROM_ADDRESS}`,
      `Antwort an / reply to: ${env.MAIL_REPLY_TO ?? "-"}`,
      `Zeit / time: ${new Date().toISOString()}`,
    ].join("\n"),
  });

  logger.info("Test mail sent");
}

void runScript(logger, "mail-check", () => runCheck(process.argv[2]));
