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
import { router } from "./app/router";
import { onSessionExpired } from "./core/api/client";
import { createAppI18n, devLocaleOverride, initialLocale, setLocale } from "./core/i18n";
import { createAppQueryClient } from "./core/api/queryClient";
import { NAV_ITEMS } from "./core/navigation/navigation";
import { startPushNotifications } from "./services/pushNotifications";

const app = createApp(App);
const queryClient = createAppQueryClient();
const i18n = createAppI18n();

onSessionExpired(() => handleSessionExpired(router, queryClient));

installGuards(router, queryClient);
watchCampaignAccess(router, queryClient);

app.use(createPinia());
app.use(router);
app.provide(NAV_ITEMS, navItemsOf(frontendModules));
app.use(VueQueryPlugin, { queryClient });
app.use(i18n);

// Mount once the language is loaded, so the first paint is already translated.
const override = devLocaleOverride();
void setLocale(i18n, override ?? initialLocale(), { remember: !override }).finally(() => app.mount("#app"));

void startPushNotifications();
