import { AUTH_FRONTEND_PATHS } from "#src/modules/auth/domain/AuthFrontendPaths";
import { getAuthLang } from "#src/modules/auth/lang/AuthLang";

export function buildPasswordResetUrl(frontendOrigin: string, token: string): string {
  const url = new URL(AUTH_FRONTEND_PATHS.passwordReset, frontendOrigin);
  url.searchParams.set("token", token);
  return url.toString();
}

export function renderPasswordResetEmail(input: {
  locale: string | undefined;
  resetUrl: string;
  expiresAt: Date;
}): {
  subject: string;
  text: string;
} {
  const lang = getAuthLang(input.locale);

  const text = [
    lang.passwordResetEmail.intro,
    "",
    lang.passwordResetEmail.actionLabel,
    input.resetUrl,
    "",
    lang.passwordResetEmail.oneTimeHint,
    `${lang.passwordResetEmail.expiresHintPrefix} ${input.expiresAt.toISOString()}.`,
    "",
    lang.passwordResetEmail.ignoreHint,
  ].join("\n");

  return {
    subject: lang.passwordResetEmail.subject,
    text,
  };
}
