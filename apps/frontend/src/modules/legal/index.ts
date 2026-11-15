import { defineFrontendModule } from "@/core/modules";

/**
 * Legal notice and privacy policy: open to everybody, linked in the footer of the sign-in pages
 * and next to the privacy consent.
 */
export const legalModule = defineFrontendModule({
  name: "legal",
  routes: {
    bare: [
      { path: "impressum", name: "legal-imprint", component: () => import("./views/ImprintView.vue") },
      { path: "datenschutz", name: "legal-privacy", component: () => import("./views/PrivacyView.vue") },
    ],
  },
});
