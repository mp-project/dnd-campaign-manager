/**
 * Language basics shared by the frontend, the backend and the admin website: which languages exist,
 * which one applies, and the D&D terms every language has to name the same way.
 */

/** Languages the app ships. German is the reference: its messages define the keys. */
export const SUPPORTED_LOCALES = ["de", "en"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "de";

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Maps a language tag (`de-AT`, `en_US`, `EN`) to a supported locale, or null. */
export function matchLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const language = tag.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(language) ? language : null;
}

/**
 * Address of a public page (path relative to `/`, without slashes) in one language: German without
 * a prefix (`/`, `/impressum`), every other language under `/<lang>/…` (`/en`, `/en/faq`). The app
 * itself has no language in its URLs.
 */
export function localizedPath(path: string, locale: Locale): string {
  const segments = [locale === DEFAULT_LOCALE ? "" : locale, path].filter(Boolean);
  return `/${segments.join("/")}`;
}

/**
 * The first candidate that names a supported language, otherwise German. Callers pass them in order
 * of precedence: profile → last choice in this browser → browser languages.
 */
export function resolveLocale(candidates: ReadonlyArray<string | null | undefined>): Locale {
  for (const candidate of candidates) {
    const locale = matchLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Rule editions whose terms differ (2014 "Rasse"/"Race", 2024 "Spezies"/"Species"). The glossary of
 * each language has the current terms plus overrides per edition.
 */
export const RULESET_EDITIONS = ["2014", "2024"] as const;

export type RulesetEdition = (typeof RULESET_EDITIONS)[number];

/** D&D terms with one fixed translation per language (and edition), used everywhere the same way. */
export const GLOSSARY_TERMS = [
  "abilityScores",
  "armorClass",
  "background",
  "cantrip",
  "class",
  "condition",
  "feat",
  "hitPoints",
  "initiative",
  "proficiencyBonus",
  "savingThrow",
  "skill",
  "species",
  "spell",
  "spellSlot",
  "subclass",
] as const;

export type GlossaryTerm = (typeof GLOSSARY_TERMS)[number];
