import { DEFAULT_LOCALE } from "@dnd/i18n";

import { PSEUDO_LOCALE } from "@/core/i18n/pseudo";
import { timeZone } from "@/core/i18n/settings";

/**
 * The backend's rules for account fields (`UserBaseSchema`, auth DTOs), checked before sending so
 * the error shows at the field. The backend checks them again.
 */
export const PASSWORD_MIN_LENGTH = 12;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])$/;

export function isEmail(value: string): boolean {
  const email = value.trim();
  return email.length >= 3 && email.length <= 320 && EMAIL.test(email);
}

export function isPassword(value: string): boolean {
  return value.length >= PASSWORD_MIN_LENGTH && value.length <= 200;
}

export function isDisplayName(value: string): boolean {
  const name = value.trim();
  return name.length >= 1 && name.length <= 120;
}

/** Empty is fine (optional); the backend lowercases, so the check does too. */
export function isUsername(value: string): boolean {
  const name = value.trim().toLowerCase();
  return name === "" || (name.length >= 3 && name.length <= 24 && USERNAME.test(name));
}

export function optionalUsername(value: string): { username?: string } {
  const name = value.trim().toLowerCase();
  return name ? { username: name } : {};
}

/**
 * What a new account takes over from this browser. The pseudo language (development) is no
 * language of the profile; German stands in for it.
 */
export function browserSettings(locale: string): { locale: string; timezone: string } {
  return { locale: locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale, timezone: timeZone.value };
}

/** Email handed from one page to the next (registration → confirmation → sign-in) in the history state, not in the URL. */
export function emailFromHistory(): string {
  const email: unknown = (window.history.state as { email?: unknown } | null)?.email;
  return typeof email === "string" ? email : "";
}
