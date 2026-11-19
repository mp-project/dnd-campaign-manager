import { defineFrontendModule } from "@/core/modules";

/**
 * Members of a campaign: the sharing page ("Freigaben", `/k/<campaign>/freigaben`) with roles and
 * removing members, for the game master and co-authors. Its second tab, the invitations, comes
 * from `campaign-invitations`; the header with both tabs lives here (`SharingHeader`).
 */
export const campaignMembershipsModule = defineFrontendModule({
  name: "campaign-memberships",
  routes: {
    campaign: [
      {
        path: "freigaben",
        name: "campaign-sharing",
        component: () => import("./views/MembersView.vue"),
        meta: { nav: "campaign-sharing" },
      },
    ],
  },
  nav: [
    {
      id: "campaign-sharing",
      area: "campaign",
      section: "manage",
      label: "campaign-memberships.nav.sharing",
      icon: "nav-freigaben",
      route: "campaign-sharing",
      order: 10,
      permission: "campaignMembers.updateRole",
    },
  ],
});
