import type {
  CampaignAggregate,
  CampaignTimeEventRow,
} from "#src/modules/campaigns/domain/repository/CampaignsRepository";

function toNullableIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toNullableUuid(value: string | null): string | null {
  return value;
}

export function toCampaignResponse(campaignAggregate: CampaignAggregate) {
  const { campaign, isOwner, effectivePermissions } = campaignAggregate;

  return {
    id: campaign.id,
    version: campaign.version,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
    deletedAt: toNullableIsoString(campaign.deletedAt),
    createdBy: campaign.createdBy,
    updatedBy: toNullableUuid(campaign.updatedBy),
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

export function toCampaignTimeEventResponse(event: CampaignTimeEventRow) {
  return {
    id: event.id,
    version: event.version,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    deletedAt: toNullableIsoString(event.deletedAt),
    createdBy: event.createdBy,
    updatedBy: toNullableUuid(event.updatedBy),
    campaignId: event.campaignId,
    type: event.type,
    previousGameDay: event.previousGameDay,
    newGameDay: event.newGameDay,
    previousLongRestCount: event.previousLongRestCount,
    newLongRestCount: event.newLongRestCount,
    reason: event.reason,
  };
}
