import type { Locale } from "@dnd/i18n";
import type { RouteRecordRaw } from "vue-router";

import type { IconName } from "@/components/base/iconNames";
import type { MessageKey } from "@/core/i18n/keys";

/**
 * Where a route lives, which decides its shell and URL prefix:
 * - `account`: global pages in the AppShell (`/dashboard`, later `/konto/...`)
 * - `campaign`: game master and editors in the AppShell under `/k/<campaign>/...`
 * - `player`: the player view in the PlayerShell under `/k/<campaign>/spiel/...`
 * - `bare`: pages without navigation (sign-in)
 */
export type RouteArea = "account" | "campaign" | "player" | "bare";

/**
 * Sections of the campaign navigation, in this order. `world`, `adventure` and `compendium` are
 * collapsible groups; a divider separates the content from `play` and `play` from `manage`.
 */
export type CampaignNavSection = "start" | "world" | "adventure" | "compendium" | "play" | "manage";

export type NavItem = {
  /** Unique; routes set `meta.nav` to it to mark the entry active. */
  id: string;
  label: MessageKey;
  icon: IconName;
  /** Route name; campaign routes get the current campaign as parameter. */
  route: string;
  /** Sorts entries within their section. */
  order: number;
  /** Hidden unless the viewer has this permission (only what the API would refuse anyway). */
  permission?: string;
} & (
  | { area: "account" }
  | { area: "campaign"; section: CampaignNavSection; /** One of the few targets in the mobile bottom bar. */ mobile?: boolean }
  | { area: "player"; /** Short label for the mobile bottom bar; entries without it stay in the menu. */ mobileLabel?: MessageKey }
  /** Header of the public pages; `route` is the base name of a page made with `localizedRoutes`. */
  | { area: "public" }
);

/**
 * One frontend module, named and bounded like its backend module. `app/modules.ts` lists them;
 * the router and the navigation are built from that list.
 */
export type FrontendModule = {
  name: string;
  routes?: Partial<Record<RouteArea, RouteRecordRaw[]>>;
  nav?: NavItem[];
};

export function defineFrontendModule(module: FrontendModule): FrontendModule {
  return module;
}

declare module "vue-router" {
  interface RouteMeta {
    /** Set by the router for every route from the area it was registered in. */
    area?: RouteArea;
    /** Id of the navigation entry this page belongs to. */
    nav?: string;
    /** The page brings its own padding (canvas, board). */
    fullBleed?: boolean;
    /** Public pages with the language in the address (`localizedRoutes`): the page's language. */
    locale?: Locale;
    /** Public pages: the route name without language, to address the page in another language. */
    localizedName?: string;
  }
}
