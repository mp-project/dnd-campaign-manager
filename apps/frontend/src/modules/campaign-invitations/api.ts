import { api, type ApiData, unwrap } from "@/core/api/client";

export type CampaignInvitation = ApiData<"listCampaignInvitations">["data"][number];
export type MyInvitation = ApiData<"listMyCampaignInvitations">["data"][number];
export type InvitationRole = CampaignInvitation["role"];

/** The campaign's pending invitations (game master). */
export function listInvitations(campaignId: string) {
  return unwrap(api.GET("/api/v1/campaigns/{campaignId}/invitations", { params: { path: { campaignId } } }));
}

/**
 * Invites by email address or by user tag (exactly one); the backend emails the link and answers
 * 409 when the address has a pending invitation already or the account is a member.
 */
export function createInvitation(
  campaignId: string,
  body: { email: string; role: InvitationRole; expiresInDays: number } | { userTag: string; role: InvitationRole; expiresInDays: number },
) {
  return unwrap(api.POST("/api/v1/campaigns/{campaignId}/invitations", { params: { path: { campaignId } }, body }));
}

/** The account behind a user tag, to show its name before inviting (404 when there is none). */
export function lookupUserTag(campaignId: string, userTag: string) {
  return unwrap(
    api.GET("/api/v1/campaigns/{campaignId}/invitations/lookup", { params: { path: { campaignId }, query: { userTag } } }),
  );
}

export function revokeInvitation(campaignId: string, invitationId: string) {
  return unwrap(
    api.DELETE("/api/v1/campaigns/{campaignId}/invitations/{invitationId}", { params: { path: { campaignId, invitationId } } }),
  );
}

/** The pending invitations of the signed-in account, with campaign and inviter names. */
export function listMyInvitations() {
  return unwrap(api.GET("/api/v1/me/invitations"));
}

/** By the token of the invitation email (`/invitations/accept#token=…`). */
export function acceptInvitationByToken(token: string) {
  return unwrap(api.POST("/api/v1/invitations/accept", { body: { token } }));
}

/** From the account's own list, without the email's token. */
export function acceptMyInvitation(invitationId: string) {
  return unwrap(api.POST("/api/v1/me/invitations/{invitationId}/accept", { params: { path: { invitationId } } }));
}

export function declineMyInvitation(invitationId: string) {
  return unwrap(api.POST("/api/v1/me/invitations/{invitationId}/decline", { params: { path: { invitationId } } }));
}
