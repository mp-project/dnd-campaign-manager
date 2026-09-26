import { getAuthLang } from "#src/modules/auth/lang/AuthLang";

const REGISTER_VERIFY_LINK_PATH = "auth/register/verify-email-link";

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function buildRegistrationVerificationUrl(input: {
  apiBaseUrl: string;
  token: string;
}): string {
  const baseUrl = ensureTrailingSlash(input.apiBaseUrl);
  const url = new URL(REGISTER_VERIFY_LINK_PATH, baseUrl);
  url.searchParams.set("token", input.token);
  return url.toString();
}

export function renderRegistrationVerificationEmail(input: {
  locale: string | undefined;
  verificationCode: string;
  verificationUrl: string;
  expiresAt: Date;
}): {
  subject: string;
  text: string;
} {
  const lang = getAuthLang(input.locale);

  const text = [
    lang.registrationVerificationEmail.intro,
    "",
    lang.registrationVerificationEmail.codeLabel,
    input.verificationCode,
    "",
    lang.registrationVerificationEmail.actionLabel,
    input.verificationUrl,
    "",
    lang.registrationVerificationEmail.oneTimeHint,
    `${lang.registrationVerificationEmail.expiresHintPrefix} ${input.expiresAt.toISOString()}.`,
    "",
    lang.registrationVerificationEmail.ignoreHint,
  ].join("\n");

  return {
    subject: lang.registrationVerificationEmail.subject,
    text,
  };
}
