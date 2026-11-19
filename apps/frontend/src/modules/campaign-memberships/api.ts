import { api, type ApiData, unwrap } from "@/core/api/client";

/** A member as the list gives it: managers get status, join date and version, players less. */
export type CampaignMember = ApiData<"listCampaignMembers">["data"][number];
/** A member with everything managers see (role changes need the version). */
export type ManagedCampaignMember = Extract<CampaignMember, { version: number }>;
export type MemberRole = CampaignMember["role"];

export function isManagedMember(member: CampaignMember): member is ManagedCampaignMember {
  return "version" in member;
}

export function listMembers(campaignId: string) {
  return unwrap(api.GET("/api/v1/campaigns/{campaignId}/members", { params: { path: { campaignId } } }));
}

/** 412 when somebody changed the membership meanwhile; 409 for the owner or the last editor. */
export function changeMemberRole(campaignId: string, memberId: string, body: { role: MemberRole; expectedVersion: number }) {
  return unwrap(
    api.PATCH("/api/v1/campaigns/{campaignId}/members/{memberId}", { params: { path: { campaignId, memberId } }, body }),
  );
}

/** Ends a membership; 409 for the owner or the last editor. */
export function removeMember(campaignId: string, memberId: string) {
  return unwrap(api.DELETE("/api/v1/campaigns/{campaignId}/members/{memberId}", { params: { path: { campaignId, memberId } } }));
}
