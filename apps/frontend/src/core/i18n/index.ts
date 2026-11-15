import {
  DEFAULT_LOCALE,
  type GlossaryTerm,
  type Locale,
  matchLocale,
  resolveLocale,
  type RulesetEdition,
} from "@dnd/i18n";
import { createI18n, type I18n, useI18n } from "vue-i18n";

import type { MessageKey } from "@/core/i18n/keys";
import { loadMessages, loadPseudoMessages } from "@/core/i18n/messages";
import { PSEUDO_LOCALE } from "@/core/i18n/pseudo";

/*
 * Texts never break the app. A missing or broken message falls back to German, and if German has
 * none either, nothing is shown (in development the key, with a warning). A language that can't be
 * loaded falls back to German; if that fails too, the app still starts. `npm run i18n:check` finds
 * these problems before they ship.
 */

export type AppLocale = Locale | typeof PSEUDO_LOCALE;

export type AppI18n = I18n<Record<string, never>, Record<string, never>, Record<string, never>, string, false>;

const STORAGE_KEY = "chronik.locale";

/** What is shown when no language has a usable message. */
function unresolved(key: string): string {
  return import.meta.env.DEV ? key : "";
}

function report(message: string, cause?: unknown): void {
  if (import.meta.env.DEV) console.warn(`[i18n] ${message}`, cause ?? "");
}

export function createAppI18n(): AppI18n {
  return createI18n({
    legacy: false,
    // Components use the typed `useAppI18n()`, not the untyped `$t`.
    globalInjection: false,
    locale: DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE,
    messages: {},
    missingWarn: import.meta.env.DEV,
    fallbackWarn: false,
    // Missing in every language: no raw key on screen in production.
    missing: (_locale, key) => unresolved(key),
  }) as AppI18n;
}

function storedLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Language before the profile is known: last choice in this browser → browser languages → German.
 * After sign-in the profile language (`users.locale`) wins (`setLocale(i18n, user.locale)`).
 * `?lang=qps` switches to the pseudo language in development.
 */
export function initialLocale(): AppLocale {
  try {
    if (import.meta.env.DEV && new URLSearchParams(location.search).get("lang") === PSEUDO_LOCALE) {
      return PSEUDO_LOCALE;
    }
    return resolveLocale([storedLocale(), ...(navigator.languages ?? [navigator.language])]);
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Languages already loaded into each i18n instance. */
const loadedLocales = new WeakMap<AppI18n, Set<AppLocale>>();

async function ensureLoaded(i18n: AppI18n, locale: AppLocale): Promise<boolean> {
  const loaded = loadedLocales.get(i18n) ?? new Set<AppLocale>();
  loadedLocales.set(i18n, loaded);
  if (loaded.has(locale)) return true;

  try {
    const messages = locale === PSEUDO_LOCALE ? await loadPseudoMessages() : await loadMessages(locale);
    i18n.global.setLocaleMessage(locale, messages as never);
    loaded.add(locale);
    return true;
  } catch (cause) {
    report(`language "${locale}" could not be loaded`, cause);
    return false;
  }
}

/**
 * Loads the language (once), activates it and remembers the choice for the next visit. Never
 * rejects: a language that can't be loaded falls back to German, and without German the app shows
 * no texts but keeps working. Returns the language that is active afterwards.
 */
export async function setLocale(i18n: AppI18n, requested: string): Promise<AppLocale> {
  const wanted: AppLocale =
    requested === PSEUDO_LOCALE && import.meta.env.DEV ? PSEUDO_LOCALE : (matchLocale(requested) ?? DEFAULT_LOCALE);

  // German is the fallback for single missing messages, so it is loaded in any case.
  const [wantedLoaded] = await Promise.all([ensureLoaded(i18n, wanted), ensureLoaded(i18n, DEFAULT_LOCALE)]);
  const locale = wantedLoaded ? wanted : DEFAULT_LOCALE;

  i18n.global.locale.value = locale;
  document.documentElement.lang = locale === PSEUDO_LOCALE ? DEFAULT_LOCALE : locale;

  if (locale === wanted && locale !== PSEUDO_LOCALE) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Private mode or blocked storage: the choice just isn't remembered.
    }
  }

  return locale;
}

/** The part of the vue-i18n composer used here, without its locale-literal generics. */
type Composer = {
  t(key: string, named: Record<string, unknown>, options: { locale?: string }): string;
  t(key: string, plural: number, options: { locale?: string; named?: Record<string, unknown> }): string;
  te(key: string): boolean;
  locale: { value: string };
};

function globalComposer(): Composer {
  return useI18n({ useScope: "global" }) as unknown as Composer;
}

type TranslateArgs = [key: string, second?: number | Record<string, unknown>, third?: Record<string, unknown>];

function translate(composer: Composer, locale: string | undefined, ...[key, second, third]: TranslateArgs): string {
  const options = locale ? { locale } : {};
  if (typeof second === "number") return composer.t(key, second, { ...options, ...(third ? { named: third } : {}) });
  return composer.t(key, second ?? {}, options);
}

/**
 * `t` that can't throw: a message that doesn't compile (e.g. `Hallo {name`) or renders empty in the
 * active language is taken from German, otherwise nothing is shown.
 */
function safeTranslate(composer: Composer, ...args: TranslateArgs): string {
  for (const locale of [undefined, DEFAULT_LOCALE]) {
    try {
      const text = translate(composer, locale, ...args);
      if (text !== "" || locale === DEFAULT_LOCALE) return text;
    } catch (cause) {
      report(`message "${args[0]}" is broken in "${locale ?? composer.locale.value}"`, cause);
    }
  }
  return unresolved(args[0]);
}

type Translate = {
  (key: MessageKey): string;
  (key: MessageKey, named: Record<string, unknown>): string;
  (key: MessageKey, plural: number, named?: Record<string, unknown>): string;
};

/**
 * Translation in components and composables. Keys are typed against the German files:
 *
 *   const { t } = useAppI18n();
 *   t("common.actions.save"); t("common.results.count", total, { count: total });
 *   t(errorMessageKey(error)) // API errors, see `@/core/api/errors`
 */
export function useAppI18n() {
  const composer = globalComposer();
  const t = ((...args: TranslateArgs) => safeTranslate(composer, ...args)) as Translate;

  return { t, locale: composer.locale };
}

/**
 * D&D terms in the wording of the campaign's ruleset edition (2014 "Volk"/"Race",
 * 2024 "Spezies"/"Species"). Without an edition the current terms apply.
 */
export function useGlossary() {
  const composer = globalComposer();

  function term(name: GlossaryTerm, edition?: RulesetEdition | null): string {
    const override = edition ? `glossary.editions.${edition}.${name}` : null;
    // Without an override for the edition the current term applies; both fall back to German.
    const key = override && composer.te(override) ? override : `glossary.terms.${name}`;
    return safeTranslate(composer, key);
  }

  return { term };
}
