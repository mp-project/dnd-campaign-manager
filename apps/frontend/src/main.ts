import "@fontsource/libre-baskerville/400.css";
import "@fontsource/libre-baskerville/400-italic.css";
import "@fontsource/libre-baskerville/700.css";
import "@fontsource-variable/lora/index.css";
import "@fontsource-variable/lora/wght-italic.css";
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
import { createAppI18n, devLocaleOverride, initialLocale, setLocale } from "./core/i18n";
import { createAppQueryClient } from "./core/api/queryClient";
import { installReducedMotion } from "./core/motion/reducedMotion";
import { installAppHead } from "./core/seo/appHead";
import { NAV_ITEMS } from "./core/navigation/navigation";
import { startPushNotifications } from "./services/pushNotifications";

const app = createApp(App);
const queryClient = createAppQueryClient();
const i18n = createAppI18n();

installReducedMotion();
onSessionExpired(() => handleSessionExpired(router, queryClient));

installGuards(router, queryClient);
installAppHead(router);
watchCampaignAccess(router, queryClient);

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
void startLocale.finally(() => app.mount("#app"));

void startPushNotifications();
