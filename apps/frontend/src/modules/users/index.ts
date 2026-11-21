import { defineFrontendModule } from "@/core/modules";

/**
 * The own account (`/konto/:tab`): profile and settings, sign-in and security (Clerk's account
 * view with devices and sessions). Reached through the user menu. Notifications and appearance follow with preferences.
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
        ],
      },
    ],
  },
});
