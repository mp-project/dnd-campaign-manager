import type { RouteRecordRedirectOption } from "vue-router";

import { localizedRoutes } from "@/core/i18n/localizedRoutes";
import { defineFrontendModule } from "@/core/modules";

/** Earlier sign-in addresses (links in old mails, bookmarks) lead to the sign-in. */
const toLogin: RouteRecordRedirectOption = (to) => ({ name: "auth-login", query: to.query });

/**
 * Sign-in pages without navigation, all through Clerk: sign in (`/login`), register (`/registrieren`,
 * while the waitlist is on only with Clerk's invitation) and the waitlist (`/warteliste`, the
 * pre-registration, in every language). Clerk's own steps (codes, second factor, SSO callback) live
 * under the first two paths, so they take any rest. Signing out lives in the user menu, account
 * security in the profile.
 */
export const authModule = defineFrontendModule({
  name: "auth",
  routes: {
    bare: [
      { path: "login/:step(.*)*", name: "auth-login", component: () => import("./views/LoginView.vue") },
      { path: "registrieren/:step(.*)*", name: "auth-register", component: () => import("./views/RegisterView.vue") },
      ...localizedRoutes({ path: "warteliste", name: "auth-waitlist", component: () => import("./views/WaitlistView.vue") }),
      { path: "aktivierung", redirect: toLogin },
      { path: "passwort-vergessen", redirect: toLogin },
      { path: "passwort-zuruecksetzen", redirect: toLogin },
      { path: "auth", redirect: toLogin },
      { path: "auth/login", redirect: toLogin },
      { path: "auth/register", redirect: (to) => ({ name: "auth-register", query: to.query }) },
      { path: "auth/callback", redirect: toLogin },
      { path: "auth/reset-password", redirect: toLogin },
    ],
  },
});
