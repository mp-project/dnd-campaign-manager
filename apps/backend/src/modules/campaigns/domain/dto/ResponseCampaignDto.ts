import { z } from "zod";

import { standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse } from "#core/http/listResponse";
import {
  CampaignBaseSchema,
  CampaignTimeEventBaseSchema,
} from "#src/modules/campaigns/domain/dto/BaseCampaignDto";
import type {
  CampaignAggregate,
  CampaignTimeEventRow,
} from "#src/modules/campaigns/domain/repository/CampaignsRepository";

export const ResponseCampaignSchema = CampaignBaseSchema.extend({
  isOwner: z.boolean(),
  effectivePermissions: z.array(z.string().min(1)),
});

export const ResponseCampaignListSchema = standardListResponseDto(ResponseCampaignSchema);

export const ResponseCampaignTimeEventSchema = CampaignTimeEventBaseSchema;

export const ResponseCampaignTimeHistorySchema = standardListResponseDto(
  ResponseCampaignTimeEventSchema,
);

export type ResponseCampaignDto = z.infer<typeof ResponseCampaignSchema>;
export type ResponseCampaignListDto = z.infer<typeof ResponseCampaignListSchema>;
export type ResponseCampaignTimeEventDto = z.infer<typeof ResponseCampaignTimeEventSchema>;
export type ResponseCampaignTimeHistoryDto = z.infer<typeof ResponseCampaignTimeHistorySchema>;

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

export function toCampaignTimeEventResponse(
  event: CampaignTimeEventRow,
): ResponseCampaignTimeEventDto {
  return {
    id: event.id,
    version: event.version,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    deletedAt: event.deletedAt?.toISOString() ?? null,
    createdBy: event.createdBy,
    updatedBy: event.updatedBy,
    campaignId: event.campaignId,
    type: event.type,
    previousGameDay: event.previousGameDay,
    newGameDay: event.newGameDay,
    previousLongRestCount: event.previousLongRestCount,
    newLongRestCount: event.newLongRestCount,
    reason: event.reason,
  };
}

export function toCampaignTimeHistoryResponse(
  events: CampaignTimeEventRow[],
  limit: number,
): ResponseCampaignTimeHistoryDto {
  return createStandardListResponse({
    data: events.map(toCampaignTimeEventResponse),
    limit,
    nextCursor: null,
  });
}
