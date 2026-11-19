import { createRouter, createWebHistory, type RouteRecordRaw, START_LOCATION } from "vue-router";

import { frontendModules } from "@/app/modules";
import type { FrontendModule, RouteArea } from "@/core/modules";
import BareLayout from "@/layouts/BareLayout.vue";


const AppShell = () => import("@/layouts/AppShell.vue");
const PlayerShell = () => import("@/layouts/PlayerShell.vue");

function routesOf(modules: readonly FrontendModule[], area: RouteArea): RouteRecordRaw[] {
  return modules.flatMap((module) => module.routes?.[area] ?? []);
}

/**
 * Routes from the modules, one parent per area; campaigns are addressed as `/k/<short id>-<slug>/...`.
 * `/` is the public start page (bare area); the app starts at `/dashboard`.
 * The parent sets `meta.area`; children inherit it through the merged route meta.
 */
export function buildRoutes(modules: readonly FrontendModule[]): RouteRecordRaw[] {
  return [
    // Development only: all building blocks on one page (not in the production build).
    ...(import.meta.env.DEV
      ? [
          { path: "/_bausteine", name: "dev-components", component: () => import("@/dev/ComponentsShowcase.vue") },
          // The preview pictures of the public pages, photographed by `npm run og:images`.
          { path: "/_vorschaubild/:variant(start|seite)", name: "dev-og-image", component: () => import("@/dev/OgImageView.vue") },
        ]
      : []),
    // Before the account area, whose parent also sits at `/`: the start page (the bare area's empty
    // child) must win there, not the shell without a page. The catch-all ranks last anyway.
    {
      path: "/",
      component: BareLayout,
      meta: { area: "bare" },
      children: [
        ...routesOf(modules, "bare"),
        { path: ":pathMatch(.*)*", name: "not-found", component: () => import("@/app/views/NotFoundView.vue") },
      ],
    },
    {
      path: "/",
      component: AppShell,
      meta: { area: "account" },
      children: routesOf(modules, "account"),
    },
    {
      path: "/k/:campaign/spiel",
      component: PlayerShell,
      meta: { area: "player" },
      children: routesOf(modules, "player"),
    },
    {
      path: "/k/:campaign",
      component: AppShell,
      meta: { area: "campaign" },
      children: routesOf(modules, "campaign"),
    },
  ];
}

/** How long a restored place or an anchor waits for the page to be built before giving up. */
const SCROLL_WAIT_MS = 3000;

/**
 * Resolves once `ready()` holds, checked every frame, or after `SCROLL_WAIT_MS` anyway: right
 * after a load the page renders only once its language, chunks and pictures are there.
 */
function when(ready: () => boolean): Promise<void> {
  const until = performance.now() + SCROLL_WAIT_MS;
  return new Promise((resolve) => {
    const check = () => (ready() || performance.now() >= until ? resolve() : requestAnimationFrame(check));
    check();
  });
}

export const router = createRouter({
  history: createWebHistory(),
  routes: buildRoutes(frontendModules),
  /**
   * Pages that scroll the window (start page, sign-in, legal pages): a reload and back and forward
   * return to the old place (Vue Router keeps it in `history.state`), a link with a hash goes to its
   * anchor, a new page starts at the top, a changed query stays where it is. The app shells scroll
   * their own `#main` and reset it themselves.
   */
  async scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      const top = savedPosition.top ?? 0;
      // Text reflows once the fonts are in, which moves everything below it.
      await document.fonts?.ready;
      await when(() => document.documentElement.scrollHeight - window.innerHeight >= top);
      return savedPosition;
    }
    if (to.hash) {
      // By id, not as a selector: a hash like "#1-intro" is no valid selector.
      await when(() => document.getElementById(decodeURIComponent(to.hash.slice(1))) !== null);
      return { el: to.hash };
    }
    if (from === START_LOCATION || to.path !== from.path) return { top: 0 };
    return false;
  },
});

/**
 * Vue Router stores the window's place in `history.state` only on navigations and while the page
 * is hidden (switching tabs). Chrome and Firefox don't keep a change made while a page is being
 * reloaded, so the place is stored shortly after each scroll instead, in the same field, which
 * Vue Router reads as `savedPosition` after a reload. Not on every scroll event: Safari refuses
 * more than about a hundred history changes in a short time.
 */
const SCROLL_SAVE_DELAY_MS = 200;

if (typeof window !== "undefined") {
  let pending: ReturnType<typeof setTimeout> | undefined;
  window.addEventListener(
    "scroll",
    () => {
      clearTimeout(pending);
      pending = setTimeout(() => {
        if (!history.state) return;
        history.replaceState({ ...history.state, scroll: { left: window.scrollX, top: window.scrollY } }, "");
      }, SCROLL_SAVE_DELAY_MS);
    },
    { passive: true },
  );
}
