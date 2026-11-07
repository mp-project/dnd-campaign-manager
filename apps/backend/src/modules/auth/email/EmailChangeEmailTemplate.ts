import { getAuthLang } from "#src/modules/auth/lang/AuthLang";

const EMAIL_CHANGE_CONFIRM_LINK_PATH = "auth/email-change/confirm-link";

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function buildEmailChangeConfirmationUrl(input: {
  apiBaseUrl: string;
  token: string;
}): string {
  const url = new URL(EMAIL_CHANGE_CONFIRM_LINK_PATH, ensureTrailingSlash(input.apiBaseUrl));
  url.searchParams.set("token", input.token);
  return url.toString();
}

/**
 * Sent to the new address: only its owner can confirm the change.
 */
export function renderEmailChangeConfirmationEmail(input: {
  locale: string | undefined;
  confirmationCode: string;
  confirmationUrl: string;
  expiresAt: Date;
}): { subject: string; text: string } {
  const lang = getAuthLang(input.locale).emailChangeConfirmationEmail;

  return {
    subject: lang.subject,
    text: [
      lang.intro,
      "",
      lang.codeLabel,
      input.confirmationCode,
      "",
      lang.actionLabel,
      input.confirmationUrl,
      "",
      `${lang.expiresHintPrefix} ${input.expiresAt.toISOString()}.`,
      "",
      lang.ignoreHint,
    ].join("\n"),
  };
}

/**
 * Sent to the current address, so the owner notices a change they did not ask for.
 */
export function renderEmailChangeNoticeEmail(input: {
  locale: string | undefined;
  newEmail: string;
}): { subject: string; text: string } {
  const lang = getAuthLang(input.locale).emailChangeNoticeEmail;

  return {
    subject: lang.subject,
    text: [
      lang.intro,
      "",
      `${lang.newAddressLabel} ${input.newEmail}`,
      "",
      lang.effectHint,
      lang.warningHint,
    ].join("\n"),
  };
}
