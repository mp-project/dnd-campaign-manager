import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

import { frontendModules } from "@/app/modules";
import type { FrontendModule, RouteArea } from "@/core/modules";
import BareLayout from "@/layouts/BareLayout.vue";

// The old campaign page stays until it is rebuilt; it has no area, so no guard applies.
import CampaignEditorLayout from "@/layouts/CampaignEditorLayout.vue";
import CampaignEditorPage from "@/pages/CampaignEditorPage.vue";

const AppShell = () => import("@/layouts/AppShell.vue");
const PlayerShell = () => import("@/layouts/PlayerShell.vue");

function routesOf(modules: readonly FrontendModule[], area: RouteArea): RouteRecordRaw[] {
  return modules.flatMap((module) => module.routes?.[area] ?? []);
}

/**
 * Routes from the modules, one parent per area; campaigns are addressed as `/k/<short id>-<slug>/...`.
 * The parent sets `meta.area`; children inherit it through the merged route meta.
 */
export function buildRoutes(modules: readonly FrontendModule[]): RouteRecordRaw[] {
  return [
    // Development only: all building blocks on one page (not in the production build).
    ...(import.meta.env.DEV
      ? [{ path: "/_bausteine", name: "dev-components", component: () => import("@/dev/ComponentsShowcase.vue") }]
      : []),
    {
      path: "/",
      component: AppShell,
      meta: { area: "account" },
      children: [{ path: "", redirect: "/dashboard" }, ...routesOf(modules, "account")],
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
    {
      path: "/campaign-editor",
      component: CampaignEditorLayout,
      children: [{ path: "", name: "campaign-editor", component: CampaignEditorPage }],
    },
    {
      path: "/",
      component: BareLayout,
      meta: { area: "bare" },
      children: [
        ...routesOf(modules, "bare"),
        { path: ":pathMatch(.*)*", name: "not-found", component: () => import("@/app/views/NotFoundView.vue") },
      ],
    },
  ];
}

export const router = createRouter({
  history: createWebHistory(),
  routes: buildRoutes(frontendModules),
});
