import { hashKey, type QueryClient } from "@tanstack/vue-query";

import { type Me, meQuery } from "@/core/auth/session";
import { type AppI18n, setLocale } from "@/core/i18n";
import { setTimeZone } from "@/core/i18n/settings";
import { setUserReducedMotion } from "@/core/motion/reducedMotion";
import { setFontScale } from "@/core/ui/fontScale";

/**
 * Once the profile is loaded (after sign-in, or with a running session at start), its language,
 * time zone, reduced motion, text size and collapsed sidebar apply: the profile wins over the
 * browser's choice. The sidebar follows the account only when its setting changes, so a refetch
 * doesn't undo the brief expanding by the campaign switcher. A language picked
 * in development with `?lang=` stays for that page load. `after` is the start language's loading,
 * which must not finish after the profile's and overwrite it. Without a profile (signed out, the
 * query cleared) the user's reduced motion and text size no longer apply; the system settings still do.
 */
export function applyProfileSettings(
  queryClient: QueryClient,
  i18n: AppI18n,
  options: {
    keepLocale: boolean;
    after: Promise<unknown>;
    setNavCollapsed: (collapsed: boolean) => void;
  },
): () => void {
  let applied: Me["settings"] | null = null;
  let appliedSidebar: boolean | null = null;
  const hash = hashKey(meQuery.queryKey);

  return queryClient.getQueryCache().subscribe((event) => {
    if (event.query.queryHash !== hash) return;
    if (event.type === "removed") {
      applied = null;
      appliedSidebar = null;
      setUserReducedMotion(false);
      setFontScale(100);
      return;
    }
    if (event.type !== "updated") return;
    const settings = (event.query.state.data as Me | undefined)?.settings;
    if (!settings) return;
    setUserReducedMotion(settings.reducedMotion);
    setFontScale(settings.fontScale);
    if (settings.sidebarCollapsed !== appliedSidebar) {
      appliedSidebar = settings.sidebarCollapsed;
      options.setNavCollapsed(settings.sidebarCollapsed);
    }
    if (applied?.locale === settings.locale && applied.timezone === settings.timezone) return;

    applied = settings;
    setTimeZone(settings.timezone);
    if (!options.keepLocale) void options.after.then(() => setLocale(i18n, settings.locale));
  });
}
