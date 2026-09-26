export const AUTH_SUPPORTED_LOCALES = ["en", "de"] as const;

export type AuthLocale = (typeof AUTH_SUPPORTED_LOCALES)[number];

export type PasswordResetErrorCode =
  | "PASSWORD_RESET_INVALID"
  | "PASSWORD_RESET_EXPIRED"
  | "PASSWORD_RESET_USED";

type AuthLangPack = {
  registrationVerificationEmail: {
    subject: string;
    intro: string;
    codeLabel: string;
    actionLabel: string;
    oneTimeHint: string;
    expiresHintPrefix: string;
    ignoreHint: string;
  };
  passwordResetEmail: {
    subject: string;
    intro: string;
    actionLabel: string;
    oneTimeHint: string;
    expiresHintPrefix: string;
    ignoreHint: string;
  };
  passwordResetErrors: Record<PasswordResetErrorCode, string>;
};

const AUTH_LANG: Record<AuthLocale, AuthLangPack> = {
  en: {
    registrationVerificationEmail: {
      subject: "Verify your account",
      intro: "You requested account verification.",
      codeLabel: "Your verification code:",
      actionLabel: "Or open this one-time verification link:",
      oneTimeHint: "The link can only be used once.",
      expiresHintPrefix: "This verification is valid until",
      ignoreHint: "If you did not request this, you can safely ignore this email.",
    },
    passwordResetEmail: {
      subject: "Reset your password",
      intro: "You requested a password reset for your account.",
      actionLabel: "Open this link to set a new password:",
      oneTimeHint: "This is a one-time link and can only be used once.",
      expiresHintPrefix: "This link is valid until",
      ignoreHint: "If you did not request this, you can safely ignore this email.",
    },
    passwordResetErrors: {
      PASSWORD_RESET_INVALID: "Reset token is invalid",
      PASSWORD_RESET_EXPIRED: "Reset token has expired",
      PASSWORD_RESET_USED: "Reset token was already used",
    },
  },
  de: {
    registrationVerificationEmail: {
      subject: "Konto verifizieren",
      intro: "Du hast die Verifizierung deines Kontos angefordert.",
      codeLabel: "Dein Verifizierungscode:",
      actionLabel: "Oder oeffne diesen einmaligen Verifizierungslink:",
      oneTimeHint: "Der Link kann nur einmal verwendet werden.",
      expiresHintPrefix: "Die Verifizierung ist gueltig bis",
      ignoreHint: "Falls du das nicht warst, kannst du diese E-Mail ignorieren.",
    },
    passwordResetEmail: {
      subject: "Passwort zuruecksetzen",
      intro: "Du hast ein Zuruecksetzen deines Passworts angefordert.",
      actionLabel: "Oeffne diesen Link, um ein neues Passwort zu setzen:",
      oneTimeHint: "Dieser Link ist nur einmal nutzbar.",
      expiresHintPrefix: "Der Link ist gueltig bis",
      ignoreHint: "Falls du das nicht warst, kannst du diese E-Mail ignorieren.",
    },
    passwordResetErrors: {
      PASSWORD_RESET_INVALID: "Reset-Token ist ungueltig",
      PASSWORD_RESET_EXPIRED: "Reset-Token ist abgelaufen",
      PASSWORD_RESET_USED: "Reset-Token wurde bereits verwendet",
    },
  },
};

export function resolveAuthLocale(locale: string | undefined): AuthLocale {
  const normalized = locale?.trim().toLowerCase();

  if (normalized?.startsWith("de")) {
    return "de";
  }

  return "en";
}

export function getAuthLang(locale: string | undefined): AuthLangPack {
  return AUTH_LANG[resolveAuthLocale(locale)];
}

export function getPasswordResetErrorMessage(
  code: PasswordResetErrorCode,
): string {
  return AUTH_LANG.en.passwordResetErrors[code];
}

export const authPasswordResetErrorTranslations = {
  en: AUTH_LANG.en.passwordResetErrors,
  de: AUTH_LANG.de.passwordResetErrors,
} as const;
