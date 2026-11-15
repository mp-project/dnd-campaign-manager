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
import { router } from "./app/router";
import { onSessionExpired } from "./core/api/client";
import { createAppI18n, devLocaleOverride, initialLocale, setLocale } from "./core/i18n";
import { clearSessionCache, createAppQueryClient } from "./core/api/queryClient";
import { startPushNotifications } from "./services/pushNotifications";

const app = createApp(App);
const queryClient = createAppQueryClient();
const i18n = createAppI18n();

// Redirecting to the login follows with the auth flows (plan step 1.5).
onSessionExpired(() => clearSessionCache(queryClient));

app.use(createPinia());
app.use(router);
app.use(VueQueryPlugin, { queryClient });
app.use(i18n);

// Mount once the language is loaded, so the first paint is already translated.
const override = devLocaleOverride();
void setLocale(i18n, override ?? initialLocale(), { remember: !override }).finally(() => app.mount("#app"));

void startPushNotifications();
