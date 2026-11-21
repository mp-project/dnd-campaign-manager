import { DEFAULT_LOCALE } from "@dnd/i18n";
import { type App, watch } from "vue";
import type { Router } from "vue-router";

import { clerkAppearance } from "@/core/auth/clerkAppearance";
import { logger, reportError } from "@/core/log";

type ClerkVue = typeof import("@clerk/vue");
/** The loaded Clerk instance (`window.Clerk`). */
export type ClerkInstance = NonNullable<ReturnType<ClerkVue["useClerk"]>["value"]>;

/** How long a caller waits for Clerk before it goes on without (the page shows an error). */
const LOAD_TIMEOUT_MS = 20_000;

const LOCALIZATIONS = {
  de: () => import("@clerk/localizations/de-DE").then((module) => module.deDE),
  en: () => import("@clerk/localizations/en-US").then((module) => module.enUS),
} as const;

type ClerkLocale = keyof typeof LOCALIZATIONS;

function clerkLocale(locale: string): ClerkLocale {
  return locale in LOCALIZATIONS ? (locale as ClerkLocale) : (DEFAULT_LOCALE as ClerkLocale);
}

type SessionListener = (sessionId: string | null) => void;

let host: { app: App; router: Router; locale: () => string } | null = null;
/** Clerk's start: resolves once it is loaded (however long that takes), or null when it can't start. */
let loading: Promise<ClerkInstance | null> | null = null;
const sessionListeners = new Set<SessionListener>();

export function clerkPublishableKey(): string | undefined {
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || undefined;
}

/** The build's prerendering (`scripts/prerender.ts`) saves pages without loading Clerk. */
export function isPrerendering(): boolean {
  return (window as { __QUESTARIA_PRERENDER__?: boolean }).__QUESTARIA_PRERENDER__ === true;
}

/**
 * Remembers the app for loading Clerk later. Clerk is not part of the start: public pages never
 * load it (no third-party request for visitors); the sign-in pages and the app's areas do.
 */
export function installClerk(app: App, router: Router, locale: () => string): void {
  host = { app, router, locale };
}

/** Called with the new session id whenever the browser's session changes (sign-in, sign-out). */
export function onClerkSessionChange(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

/**
 * Loads Clerk once (script, language, theme) and resolves with the instance, or with null when
 * there is no publishable key, the page is being prerendered or Clerk isn't loaded within the
 * time limit. A slow start is not given up: a later call gets the instance once it arrived.
 */
export function loadClerk(): Promise<ClerkInstance | null> {
  loading ??= startClerk().catch((error: unknown) => {
    reportError(error, { action: "loadClerk" });
    return null;
  });
  let timer = 0;
  const timeout = new Promise<null>((resolve) => {
    timer = window.setTimeout(() => {
      logger.warn("Clerk did not load in time");
      resolve(null);
    }, LOAD_TIMEOUT_MS);
  });
  return Promise.race([loading, timeout]).finally(() => window.clearTimeout(timer));
}

async function startClerk(): Promise<ClerkInstance | null> {
  const publishableKey = clerkPublishableKey();
  if (!host || !publishableKey || isPrerendering()) return null;

  const { app, router, locale } = host;
  const [clerkVue, localization] = await Promise.all([
    import("@clerk/vue"),
    LOCALIZATIONS[clerkLocale(locale())](),
  ]);

  app.use(clerkVue.clerkPlugin, {
    publishableKey,
    localization,
    appearance: clerkAppearance,
    signInUrl: "/login",
    signUpUrl: "/registrieren",
    waitlistUrl: "/warteliste",
    signInFallbackRedirectUrl: "/dashboard",
    signUpFallbackRedirectUrl: "/dashboard",
    afterSignOutUrl: "/login",
    // Clerk's own steps (second factor, code, SSO callback) stay inside the app's router.
    routerPush: (to: string) => router.push(to),
    routerReplace: (to: string) => router.replace(to),
  });

  const clerkRef = app.runWithContext(() => clerkVue.useClerk());
  const clerk = await new Promise<ClerkInstance>((resolve) => {
    const stop = watch(
      clerkRef,
      (value) => {
        if (!value?.loaded) return;
        queueMicrotask(() => stop());
        resolve(value);
      },
      { immediate: true },
    );
  });

  let sessionId = clerk.session?.id ?? null;
  clerk.addListener(({ session }) => {
    const next = session?.id ?? null;
    if (next === sessionId) return;
    sessionId = next;
    sessionListeners.forEach((listener) => listener(next));
  });

  // The page's language changes Clerk's texts too.
  watch(locale, async (next) => {
    clerkVue.updateClerkOptions({ localization: await LOCALIZATIONS[clerkLocale(next)]() });
  });

  return clerk;
}

/**
 * The session token for the API, or null without a session. Only once a page asked for Clerk:
 * public pages send their few requests (contact form) without one.
 */
export async function sessionToken(options: { fresh?: boolean } = {}): Promise<string | null> {
  if (!loading) return null;
  const clerk = await loadClerk();
  if (!clerk?.isSignedIn || !clerk.session) return null;
  return clerk.session.getToken(options.fresh ? { skipCache: true } : undefined);
}
