import { isProductionLikeNodeEnv, type AppEnv } from "#core/env";
import type { AppLogger } from "#core/log/logger";
import { missingS3Settings } from "#core/storage/factory";

/** A part of the app that is switched off because its settings are missing. */
export type MissingIntegration = {
  /** Stable name for logs and alerts. */
  integration: string;
  /** Names of the missing settings, never values. */
  missing: string[];
  /** What does not work meanwhile. */
  effect: string;
};

/**
 * Lists the integrations whose settings are missing. None of them stops the app: each part answers
 * 503 or falls back on its own (see the comments in `#core/env`), so this only names them.
 *
 * @param env Validated runtime environment.
 * @returns Every switched-off integration, empty when everything is configured.
 */
export function missingIntegrations(env: AppEnv): MissingIntegration[] {
  const result: MissingIntegration[] = [];

  if (!env.CLERK_SECRET_KEY) {
    result.push({
      integration: "clerk",
      missing: ["CLERK_SECRET_KEY"],
      effect: "no request is signed in",
    });
  }

  if (!env.CLERK_WEBHOOK_SIGNING_SECRET) {
    result.push({
      integration: "clerk-webhook",
      missing: ["CLERK_WEBHOOK_SIGNING_SECRET"],
      effect: "the Clerk webhook answers 503",
    });
  }

  if (env.STORAGE_DRIVER === "s3") {
    const missing = missingS3Settings(env);

    if (missing.length > 0) {
      result.push({ integration: "storage", missing, effect: "file operations answer 503" });
    }
  }

  if (env.MAIL_DRIVER === "smtp" && Boolean(env.MAIL_SMTP_USER) !== Boolean(env.MAIL_SMTP_PASS)) {
    result.push({
      integration: "mail",
      missing: [env.MAIL_SMTP_USER ? "MAIL_SMTP_PASS" : "MAIL_SMTP_USER"],
      effect: "mails are sent without login and will likely be refused (503)",
    });
  }

  if (!env.CONTACT_EMAIL_TO) {
    result.push({
      integration: "contact",
      missing: ["CONTACT_EMAIL_TO"],
      effect: "the contact form answers 503",
    });
  }

  // Development and tests run without Redis on purpose.
  if (isProductionLikeNodeEnv(env.NODE_ENV) && !env.REDIS_URL) {
    result.push({
      integration: "redis",
      missing: ["REDIS_URL"],
      effect: "rate limits and caches count per process",
    });
  }

  return result;
}

/**
 * Logs one warning per switched-off integration.
 *
 * @param logger Logger of the process.
 * @param env Validated runtime environment.
 * @param only Integrations that matter for this process; all when omitted.
 */
export function warnMissingIntegrations(
  logger: AppLogger,
  env: AppEnv,
  only?: readonly string[],
): void {
  for (const entry of missingIntegrations(env)) {
    if (only && !only.includes(entry.integration)) {
      continue;
    }

    logger.warn(
      { integration: entry.integration, missing: entry.missing },
      `Integration not configured: ${entry.effect}`,
    );
  }
}
