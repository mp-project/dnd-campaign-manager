import { z } from "zod";

import { standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse } from "#core/http/listResponse";
import { CampaignBaseSchema } from "#src/modules/campaigns/domain/dto/BaseCampaignDto";
import type { CampaignAggregate } from "#src/modules/campaigns/domain/repository/CampaignsRepository";

export const ResponseCampaignSchema = CampaignBaseSchema.extend({
  isOwner: z.boolean(),
  effectivePermissions: z.array(z.string().min(1)),
});

export const ResponseCampaignListSchema = standardListResponseDto(ResponseCampaignSchema);

/** `merged` lists fields that kept a newer value because somebody else changed them. */
export const ResponseUpdateCampaignSchema = ResponseCampaignSchema.extend({
  merged: z.array(z.string().min(1)),
});

export type ResponseCampaignDto = z.infer<typeof ResponseCampaignSchema>;
export type ResponseCampaignListDto = z.infer<typeof ResponseCampaignListSchema>;
export type ResponseUpdateCampaignDto = z.infer<typeof ResponseUpdateCampaignSchema>;

export function toCampaignResponse(aggregate: CampaignAggregate): ResponseCampaignDto {
  const { campaign, isOwner, effectivePermissions } = aggregate;

  return {
    id: campaign.id,
    version: campaign.version,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    deletedAt: campaign.deletedAt?.toISOString() ?? null,
    createdBy: campaign.createdBy,
    updatedBy: campaign.updatedBy,
    ownerUserId: campaign.ownerUserId,
    rulesetId: campaign.rulesetId,
    name: campaign.name,
    slug: campaign.slug,
    description: campaign.description,
    status: campaign.status,
    currentGameDay: campaign.currentGameDay,
    longRestCount: campaign.longRestCount,
    settings: (campaign.settings ?? {}) as Record<string, unknown>,
    isOwner,
    effectivePermissions,
  };
}

export function toCampaignListResponse(
  aggregates: CampaignAggregate[],
  limit: number,
  total: number,
): ResponseCampaignListDto {
  return createStandardListResponse({
    data: aggregates.map(toCampaignResponse),
    limit,
    nextCursor: null,
    total,
  });
}

export function toUpdateCampaignResponse(
  aggregate: CampaignAggregate,
  merged: string[],
): ResponseUpdateCampaignDto {
  return { ...toCampaignResponse(aggregate), merged };
}
