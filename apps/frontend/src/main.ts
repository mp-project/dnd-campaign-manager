import { createPinia } from "pinia";
import { createApp } from "vue";

import App from "./App.vue";
import { router } from "./app/router";
import "./assets/main.css";
import { startPushNotifications } from "./services/pushNotifications";

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.mount("#app");

void startPushNotifications();
