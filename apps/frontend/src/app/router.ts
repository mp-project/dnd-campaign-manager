import { createRouter, createWebHistory } from "vue-router";

import AuthLayout from "@/layouts/AuthLayout.vue";
import CampaignEditorLayout from "@/layouts/CampaignEditorLayout.vue";
import DashboardLayout from "@/layouts/DashboardLayout.vue";
import PlayerViewLayout from "@/layouts/PlayerViewLayout.vue";
import AuthPage from "@/pages/AuthPage.vue";
import CampaignEditorPage from "@/pages/CampaignEditorPage.vue";
import DashboardPage from "@/pages/DashboardPage.vue";
import PlayerViewPage from "@/pages/PlayerViewPage.vue";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/auth",
      component: AuthLayout,
      children: [
        {
          path: "",
          name: "auth",
          component: AuthPage,
        },
      ],
    },
    {
      path: "/",
      component: DashboardLayout,
      children: [
        {
          path: "",
          name: "dashboard",
          component: DashboardPage,
        },
      ],
    },
    {
      path: "/campaign-editor",
      component: CampaignEditorLayout,
      children: [
        {
          path: "",
          name: "campaign-editor",
          component: CampaignEditorPage,
        },
      ],
    },
    {
      path: "/player-view",
      component: PlayerViewLayout,
      children: [
        {
          path: "",
          name: "player-view",
          component: PlayerViewPage,
        },
      ],
    },
  ],
});
