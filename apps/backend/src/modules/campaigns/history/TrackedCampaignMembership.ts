import type { AppDatabase } from "#core/db/pool";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { campaignMemberships } from "#src/modules/campaigns/domain/entities/CampaignsTable";
import type { CampaignMembershipRow } from "#src/modules/campaigns/domain/repository/CampaignsRepository";

export const CAMPAIGN_MEMBERSHIP_ENTITY_TYPE = "campaignMembership";

export const CAMPAIGN_MEMBERSHIP_ACTIONS = {
  join: "campaignMembership.join",
  updateRole: "campaignMembership.updateRole",
  revoke: "campaignMembership.revoke",
} as const;

type TrackedCampaignMembershipDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignRole | null>;
};

/**
 * History rules of a membership. It lives here because a new campaign creates the membership of its
 * owner. The GM and editors may change memberships, players not even their own, so players have no
 * history of them. Role and status grant rights, so they can never be undone or restored.
 */
export function createTrackedCampaignMembership(deps: TrackedCampaignMembershipDeps) {
  return defineTrackedEntity({
    type: CAMPAIGN_MEMBERSHIP_ENTITY_TYPE,
    table: campaignMemberships,
    campaignId: (row) => row.campaignId,
    access: campaignHistoryAccess<CampaignMembershipRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      role: field.value({ revertible: false }),
      status: field.value({ revertible: false }),
      // Set once when the membership is created.
      campaignId: field.ignore(),
      userId: field.ignore(),
      joinedAt: field.ignore(),
      // Follow the status; the entry already says who changed it and when.
      revokedAt: field.ignore(),
      revokedBy: field.ignore(),
    },
  });
}

export type TrackedCampaignMembership = ReturnType<typeof createTrackedCampaignMembership>;
