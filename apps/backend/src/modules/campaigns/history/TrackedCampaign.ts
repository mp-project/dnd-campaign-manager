import type { AppDatabase } from "#core/db/pool";
import { ConflictError } from "#core/error/http/index";
import {
  campaignHistoryAccess,
  type CampaignHistoryRole,
} from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import { CampaignBaseSchema } from "#src/modules/campaigns/domain/dto/BaseCampaignDto";
import { campaigns } from "#src/modules/campaigns/domain/entities/CampaignsTable";
import type { CampaignRow } from "#src/modules/campaigns/domain/repository/CampaignsRepository";

export const CAMPAIGN_ENTITY_TYPE = "campaign";

export const CAMPAIGN_ACTIONS = {
  create: "campaign.create",
  update: "campaign.update",
  archive: "campaign.archive",
  advanceTime: "campaign.advanceTime",
  correctTime: "campaign.correctTime",
} as const;

type TrackedCampaignDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignHistoryRole | null>;
};

/**
 * History rules of a campaign. Only the GM may change a campaign, so nobody else in the campaign
 * sees its history.
 */
export function createTrackedCampaign(deps: TrackedCampaignDeps) {
  return defineTrackedEntity({
    type: CAMPAIGN_ENTITY_TYPE,
    table: campaigns,
    baseSchema: CampaignBaseSchema,
    campaignId: (row) => row.id,
    access: campaignHistoryAccess<CampaignRow>({
      campaignId: (row) => row.id,
      resolveRole: deps.resolveRole,
      editRoles: ["GM"],
    }),
    fields: {
      name: field.value(),
      slug: field.value(),
      description: field.value(),
      status: field.value(),
      settings: field.value(),
      // The log of the campaign time, so it reaches back further than other fields.
      currentGameDay: field.counter({ min: 0, history: "high" }),
      longRestCount: field.counter({ min: 0, history: "high" }),
      // Set once when the campaign is created.
      ownerUserId: field.ignore(),
      rulesetId: field.ignore(),
    },
    validate: (next, current) => {
      if (current.status === "ARCHIVED" && next.status === "ARCHIVED") {
        throw new ConflictError("Archived campaigns cannot be modified");
      }
    },
  });
}

export type TrackedCampaign = ReturnType<typeof createTrackedCampaign>;
