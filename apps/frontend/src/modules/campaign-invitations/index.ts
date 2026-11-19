import { defineFrontendModule } from "@/core/modules";

/**
 * Invitations to campaigns: the second tab of the sharing page (`…/freigaben/einladungen`, game
 * master) with inviting in the editor drawer (`…/neu`), accepting from the email's link
 * (`/invitations/accept#token=…`, the address the backend sends) and the account's own
 * invitations on the dashboard (`MyInvitationsCard`).
 */
export const campaignInvitationsModule = defineFrontendModule({
  name: "campaign-invitations",
  routes: {
    campaign: [
      {
        path: "freigaben/einladungen",
        name: "campaign-invitations",
        component: () => import("./views/InvitationsView.vue"),
        meta: { nav: "campaign-sharing" },
        children: [
          {
            path: "neu",
            name: "campaign-invitation-new",
            component: () => import("./views/InviteView.vue"),
          },
        ],
      },
    ],
    bare: [
      {
        path: "invitations/accept",
        name: "invitation-accept",
        component: () => import("./views/AcceptInvitationView.vue"),
      },
    ],
  },
});
