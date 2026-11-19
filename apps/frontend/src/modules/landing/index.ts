import { defineFrontendModule } from "@/core/modules";
import { localizedRoutes } from "@/core/i18n/localizedRoutes";

/**
 * Public start page, one address per language (`/` German, `/en` English): what the app is for,
 * who it serves, its main features and the way to the demo (`VITE_DEMO_URL`) and to the
 * registration, and the frequently asked questions (`/faq`, `/en/faq`). Open to everybody; the app
 * itself starts at `/dashboard`.
 */
export const landingModule = defineFrontendModule({
  name: "landing",
  routes: {
    bare: [
      ...localizedRoutes({ path: "", name: "landing", component: () => import("./views/LandingView.vue") }),
      ...localizedRoutes({ path: "faq", name: "landing-faq", component: () => import("./views/FaqView.vue") }),
    ],
  },
});
