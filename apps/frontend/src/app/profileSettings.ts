import { hashKey, type QueryClient } from "@tanstack/vue-query";

import { type Me, meQuery } from "@/core/auth/session";
import { type AppI18n, setLocale } from "@/core/i18n";
import { setTimeZone } from "@/core/i18n/settings";

/**
 * Once the profile is loaded (after sign-in, or with a running session at start), its language
 * and time zone apply: the profile wins over the browser's choice. A language picked in development
 * with `?lang=` stays for that page load. `after` is the start language's loading, which must not
 * finish after the profile's and overwrite it.
 */
export function applyProfileSettings(
  queryClient: QueryClient,
  i18n: AppI18n,
  options: { keepLocale: boolean; after: Promise<unknown> },
): () => void {
  let applied: Me["settings"] | null = null;
  const hash = hashKey(meQuery.queryKey);

  return queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.query.queryHash !== hash) return;
    const settings = (event.query.state.data as Me | undefined)?.settings;
    if (!settings || (applied?.locale === settings.locale && applied.timezone === settings.timezone)) return;

    applied = settings;
    setTimeZone(settings.timezone);
    if (!options.keepLocale) void options.after.then(() => setLocale(i18n, settings.locale));
  });
}
