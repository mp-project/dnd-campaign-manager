import { defineFrontendModule } from "@/core/modules";

/**
 * Campaigns: the dashboard with the account's campaigns and the overview of one campaign, for the
 * game master and in the player view. Creating, settings and members follow.
 */
export const campaignsModule = defineFrontendModule({
  name: "campaigns",
  routes: {
    account: [
      {
        path: "dashboard",
        name: "dashboard",
        component: () => import("./views/DashboardView.vue"),
        meta: { nav: "dashboard" },
      },
    ],
    campaign: [
      {
        path: "",
        name: "campaign-overview",
        component: () => import("./views/CampaignOverviewView.vue"),
        meta: { nav: "campaign-overview" },
      },
    ],
    player: [
      {
        path: "",
        name: "player-overview",
        component: () => import("./views/CampaignOverviewView.vue"),
        meta: { nav: "player-overview" },
      },
    ],
  },
  nav: [
    { id: "dashboard", area: "account", label: "campaigns.nav.dashboard", icon: "nav-dashboard", route: "dashboard", order: 10 },
    {
      id: "campaign-overview",
      area: "campaign",
      section: "start",
      label: "campaigns.nav.overview",
      icon: "nav-uebersicht",
      route: "campaign-overview",
      order: 10,
    },
    {
      id: "player-overview",
      area: "player",
      label: "campaigns.nav.overview",
      mobileLabel: "campaigns.nav.overview",
      icon: "nav-uebersicht",
      route: "player-overview",
      order: 10,
    },
  ],
});
