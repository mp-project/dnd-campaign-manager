import { defineFrontendModule } from "@/core/modules";
import { localizedRoutes } from "@/core/i18n/localizedRoutes";

/**
 * Public start page, one address per language (`/` German, `/en` English): what the app is for,
 * who it serves, its main features and the way to the demo (`VITE_DEMO_URL`) and to the
 * registration, the frequently asked questions (`/faq`, `/en/faq`) and the roadmap (`/roadmap`,
 * `/en/roadmap`), both in the public navigation. Open to everybody; the app itself starts at
 * `/dashboard`.
 */
export const landingModule = defineFrontendModule({
  name: "landing",
  routes: {
    bare: [
      ...localizedRoutes({ path: "", name: "landing", component: () => import("./views/LandingView.vue") }),
      ...localizedRoutes({ path: "faq", name: "landing-faq", component: () => import("./views/FaqView.vue") }),
      ...localizedRoutes({ path: "roadmap", name: "landing-roadmap", component: () => import("./views/RoadmapView.vue") }),
    ],
  },
  nav: [
    { id: "faq", area: "public", label: "common.publicNav.faq", icon: "orig-info", route: "landing-faq", order: 10 },
    { id: "roadmap", area: "public", label: "common.publicNav.roadmap", icon: "ui-map", route: "landing-roadmap", order: 20 },
  ],
});
