import "@fontsource-variable/cinzel/index.css";
import "@fontsource-variable/literata/opsz.css";
import "@fontsource-variable/literata/opsz-italic.css";
import "./styles/main.css";

import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { watchCampaignAccess } from "./app/campaignAccess";
import { handleSessionExpired, installGuards } from "./app/guards";
import { frontendModules, navItemsOf } from "./app/modules";
import { installLocaleRoutes } from "./app/localeRoutes";
import { applyProfileSettings } from "./app/profileSettings";
import { router } from "./app/router";
import { onSessionExpired } from "./core/api/client";
import { clearSessionCache } from "./core/api/queryClient";
import { installClerk, onClerkSessionChange } from "./core/auth/clerk";
import { startConsent } from "./core/consent/consent";
import { createAppI18n, devLocaleOverride, initialLocale, setLocale } from "./core/i18n";
import { createAppQueryClient } from "./core/api/queryClient";
import { installErrorHandlers } from "./core/log/errorHandlers";
import { installReducedMotion } from "./core/motion/reducedMotion";
import { installAppHead } from "./core/seo/appHead";
import { NAV_ITEMS } from "./core/navigation/navigation";
import { installFaro } from "./core/telemetry/faro";
import { startPushNotifications } from "./services/pushNotifications";

const app = createApp(App);
const queryClient = createAppQueryClient();
const i18n = createAppI18n();

installErrorHandlers(app, router);
installReducedMotion();
onSessionExpired(() => handleSessionExpired(router, queryClient));
// Clerk loads only on the sign-in pages and in the app; a new or ended session clears the cache.
installClerk(app, router, () => i18n.global.locale.value);
onClerkSessionChange(() => clearSessionCache(queryClient));

installGuards(router, queryClient);
installAppHead(router);
watchCampaignAccess(router, queryClient);
installFaro(router, queryClient);

app.use(createPinia());
app.use(router);
app.provide(NAV_ITEMS, navItemsOf(frontendModules));
app.use(VueQueryPlugin, { queryClient });
app.use(i18n);

// Mount once the language is loaded, so the first paint is already translated.
const override = devLocaleOverride();
const startLocale = setLocale(i18n, override ?? initialLocale(), { remember: !override });
applyProfileSettings(queryClient, i18n, { keepLocale: override !== null, after: startLocale });
installLocaleRoutes(router, i18n, { keepLocale: override !== null, after: startLocale });
void startLocale.finally(() => {
  app.mount("#app");
  // After the first paint, in the page's language; Faro starts once statistics are allowed.
  startConsent(i18n.global.locale.value);
});

void startPushNotifications();
