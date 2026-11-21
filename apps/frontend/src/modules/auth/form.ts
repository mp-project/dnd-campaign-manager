import { DEFAULT_LOCALE } from "@dnd/i18n";

import { PSEUDO_LOCALE } from "@/core/i18n/pseudo";
import { timeZone } from "@/core/i18n/settings";

/**
 * What a new account takes over from this browser. The pseudo language (development) is no
 * language of the profile; German stands in for it.
 */
export function browserSettings(locale: string): { locale: string; timezone: string } {
  return { locale: locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale, timezone: timeZone.value };
}
