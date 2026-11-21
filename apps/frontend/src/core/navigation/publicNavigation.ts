import { DEFAULT_LOCALE, type Locale, matchLocale } from "@dnd/i18n";
import { useQuery } from "@tanstack/vue-query";
import { computed, inject } from "vue";
import { type RouteLocationRaw, useRoute } from "vue-router";

import { meQuery } from "@/core/auth/session";
import { demoUrl } from "@/core/demo";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { localizedRouteName } from "@/core/i18n/localizedRoutes";
import type { NavItem } from "@/core/modules";

import { NAV_ITEMS, type NavLink } from "./navigation";

/**
 * Navigation of the public pages (start page, FAQ, roadmap, contact, legal pages, sign-in): the
 * modules' entries of the area `public` as links, plus the two actions on the right, the demo and
 * the pre-registration (or the app for a profile this tab already knows). Header, phone menu and
 * the pages read it from here. Like those pages it asks the API nothing.
 */

/** A link of the public navigation; `active` marks the page shown (in any language). */
export type PublicNavLink = NavLink & { active: boolean };

type Translate = (key: MessageKey) => string;
type PublicItem = Extract<NavItem, { area: "public" }>;

export function publicLinks(items: readonly NavItem[], t: Translate, locale: Locale, current: string | undefined): PublicNavLink[] {
  return items
    .filter((item): item is PublicItem => item.area === "public")
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      id: item.id,
      label: t(item.label),
      icon: item.icon,
      to: { name: localizedRouteName(item.route, locale) },
      active: item.route === current,
    }));
}

export function usePublicNavigation() {
  const items = inject(NAV_ITEMS, []);
  const route = useRoute();
  const { t, locale } = useAppI18n();
  // Only what this tab already knows: public pages never ask the API.
  const me = useQuery({ ...meQuery, enabled: false });
  const signedIn = computed(() => !!me.data.value);
  const language = computed(() => matchLocale(String(locale.value)) ?? DEFAULT_LOCALE);
  const current = computed(() => route.meta.localizedName ?? (typeof route.name === "string" ? route.name : undefined));

  return {
    links: computed(() => publicLinks(items, t, language.value, current.value)),
    /** The demo's address; null hides it. */
    demo: demoUrl(),
    signedIn,
    /** Pre-registration, or the app for a profile already loaded in this tab. */
    primary: computed<{ to: RouteLocationRaw; label: string }>(() =>
      signedIn.value
        ? { to: "/dashboard", label: t("common.publicNav.toApp") }
        : { to: { name: localizedRouteName("auth-waitlist", language.value) }, label: t("common.publicNav.preregister") },
    ),
  };
}
