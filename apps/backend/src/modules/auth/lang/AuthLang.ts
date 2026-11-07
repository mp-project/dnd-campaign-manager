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
  registrationExistingAccountEmail: {
    subject: string;
    intro: string;
    actionLabel: string;
    resetHint: string;
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
  emailChangeConfirmationEmail: {
    subject: string;
    intro: string;
    codeLabel: string;
    actionLabel: string;
    expiresHintPrefix: string;
    ignoreHint: string;
  };
  emailChangeNoticeEmail: {
    subject: string;
    intro: string;
    newAddressLabel: string;
    effectHint: string;
    warningHint: string;
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
    registrationExistingAccountEmail: {
      subject: "You already have an account",
      intro: "Someone tried to register a new account with this email address, which already has one.",
      actionLabel: "Sign in here:",
      resetHint: "If you forgot your password, use \"Forgot password\" on the sign-in page.",
      ignoreHint: "If this was not you, you can ignore this email; nothing was changed.",
    },
    passwordResetEmail: {
      subject: "Reset your password",
      intro: "You requested a password reset for your account.",
      actionLabel: "Open this link to set a new password:",
      oneTimeHint: "This is a one-time link and can only be used once.",
      expiresHintPrefix: "This link is valid until",
      ignoreHint: "If you did not request this, you can safely ignore this email.",
    },
    emailChangeConfirmationEmail: {
      subject: "Confirm your new email address",
      intro: "You asked to use this address for your account.",
      codeLabel: "Your confirmation code:",
      actionLabel: "Or open this one-time confirmation link:",
      expiresHintPrefix: "The confirmation is valid until",
      ignoreHint: "If you did not request this, ignore this email; nothing will change.",
    },
    emailChangeNoticeEmail: {
      subject: "Your email address is about to change",
      intro: "Someone asked to change the email address of your account to:",
      newAddressLabel: "New address:",
      effectHint: "The change only takes effect once the new address is confirmed.",
      warningHint:
        "If this was not you, change your password right away and sign out on all devices.",
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
    registrationExistingAccountEmail: {
      subject: "Du hast bereits ein Konto",
      intro: "Jemand wollte mit dieser E-Mail-Adresse ein neues Konto anlegen, es gibt aber schon eins.",
      actionLabel: "Hier anmelden:",
      resetHint: "Falls du dein Passwort vergessen hast, nutze \"Passwort vergessen\" auf der Anmeldeseite.",
      ignoreHint: "Falls du das nicht warst, kannst du diese E-Mail ignorieren; es wurde nichts geaendert.",
    },
    passwordResetEmail: {
      subject: "Passwort zuruecksetzen",
      intro: "Du hast ein Zuruecksetzen deines Passworts angefordert.",
      actionLabel: "Oeffne diesen Link, um ein neues Passwort zu setzen:",
      oneTimeHint: "Dieser Link ist nur einmal nutzbar.",
      expiresHintPrefix: "Der Link ist gueltig bis",
      ignoreHint: "Falls du das nicht warst, kannst du diese E-Mail ignorieren.",
    },
    emailChangeConfirmationEmail: {
      subject: "Neue E-Mail-Adresse bestaetigen",
      intro: "Du moechtest diese Adresse fuer dein Konto verwenden.",
      codeLabel: "Dein Bestaetigungscode:",
      actionLabel: "Oder oeffne diesen einmaligen Bestaetigungslink:",
      expiresHintPrefix: "Die Bestaetigung ist gueltig bis",
      ignoreHint: "Falls du das nicht warst, ignoriere diese E-Mail; es aendert sich nichts.",
    },
    emailChangeNoticeEmail: {
      subject: "Deine E-Mail-Adresse soll geaendert werden",
      intro: "Jemand moechte die E-Mail-Adresse deines Kontos aendern auf:",
      newAddressLabel: "Neue Adresse:",
      effectHint: "Die Aenderung gilt erst, wenn die neue Adresse bestaetigt ist.",
      warningHint:
        "Falls du das nicht warst, aendere sofort dein Passwort und melde dich auf allen Geraeten ab.",
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
