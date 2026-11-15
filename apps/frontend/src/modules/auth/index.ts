import { defineFrontendModule } from "@/core/modules";

/**
 * Sign-in pages without navigation: sign in, register, confirm the email with the code, forgot and
 * reset the password, back from an OAuth provider. The backend links to `/login`, `/login/oauth`
 * and `/passwort-zuruecksetzen` (`AUTH_FRONTEND_PATHS` in the backend's auth module); keep them in
 * step. Signing out lives in the user menu, account security in the profile.
 */
export const authModule = defineFrontendModule({
  name: "auth",
  routes: {
    bare: [
      { path: "login", name: "auth-login", component: () => import("./views/LoginView.vue") },
      { path: "login/oauth", name: "auth-oauth", component: () => import("./views/OAuthCallbackView.vue") },
      { path: "registrieren", name: "auth-register", component: () => import("./views/RegisterView.vue") },
      { path: "aktivierung", name: "auth-activate", component: () => import("./views/ActivateView.vue") },
      { path: "passwort-vergessen", name: "auth-forgot-password", component: () => import("./views/ForgotPasswordView.vue") },
      { path: "passwort-zuruecksetzen", name: "auth-reset-password", component: () => import("./views/ResetPasswordView.vue") },
      // Earlier addresses: reset links in mails sent before the move, bookmarks.
      { path: "auth", redirect: (to) => ({ name: "auth-login", query: to.query }) },
      { path: "auth/login", redirect: (to) => ({ name: "auth-login", query: to.query }) },
      { path: "auth/register", redirect: (to) => ({ name: "auth-register", query: to.query }) },
      { path: "auth/callback", redirect: (to) => ({ name: "auth-oauth", query: to.query }) },
      { path: "auth/reset-password", redirect: (to) => ({ name: "auth-reset-password", query: to.query }) },
    ],
  },
});
