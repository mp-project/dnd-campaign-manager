import { localizedRoutes } from "@/core/i18n/localizedRoutes";
import { defineFrontendModule } from "@/core/modules";

/**
 * The contact form of the public pages, one address per language (`/kontakt`, `/en/kontakt`):
 * first and last name, email, topic, message and the accepted privacy policy, sent to
 * `POST /contact`. Open to everybody, linked in the footer of every public page.
 */
export const contactModule = defineFrontendModule({
  name: "contact",
  routes: {
    bare: localizedRoutes({ path: "kontakt", name: "contact", component: () => import("./views/ContactView.vue") }),
  },
});
