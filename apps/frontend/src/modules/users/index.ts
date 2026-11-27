import { defineFrontendModule } from "@/core/modules";

/**
 * The own account (`/konto/:tab`): profile and settings, sign-in and security (Clerk's account
 * view with devices and sessions) and appearance (text size, collapsed sidebar). Reached through the user menu.
 */
export const usersModule = defineFrontendModule({
  name: "users",
  routes: {
    account: [
      {
        path: "konto",
        component: () => import("./views/AccountView.vue"),
        children: [
          { path: "", redirect: { name: "account-profile" } },
          { path: "profil", name: "account-profile", component: () => import("./views/ProfileTab.vue") },
          { path: "anmeldung/:step(.*)*", name: "account-security", component: () => import("./views/SecurityTab.vue") },
          { path: "darstellung", name: "account-appearance", component: () => import("./views/AppearanceTab.vue") },
        ],
      },
    ],
  },
});
