import type { Router } from "vue-router";

import { type AppI18n, setLocale } from "@/core/i18n";

/**
 * Public pages with their language in the address (`meta.locale`, see
 * `@/core/i18n/localizedRoutes`): opening one activates that language before the page renders and
 * remembers it in this browser, so the sign-in that follows stays in it. `after` is the loading of
 * the start language, which must not finish later and overwrite this one; `keepLocale` (a
 * development `?lang=` override) leaves the language alone.
 */
export function installLocaleRoutes(
  router: Router,
  i18n: AppI18n,
  options: { after: Promise<unknown>; keepLocale: boolean },
): void {
  router.beforeEach(async (to) => {
    const locale = to.meta.locale;
    if (!locale || options.keepLocale) return true;
    await options.after;
    if (i18n.global.locale.value !== locale) await setLocale(i18n, locale);
    return true;
  });
}
