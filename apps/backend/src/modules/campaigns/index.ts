export { campaignsModule } from "#src/modules/campaigns/Setup";
export {
  CAMPAIGNS_MODULE_DEPENDENCIES,
  type CampaignsModuleDependencies,
} from "#src/modules/campaigns/Setup";
export { campaignsPermissionDefinitions } from "#src/modules/campaigns/permissions/CampaignsPermissions";
export {
  campaigns,
  campaignMemberships,
  campaignMemberRoleEnum,
  campaignMembershipStatusEnum,
  campaignStatusEnum,
  campaignTimeEvents,
  campaignTimeEventTypeEnum,
} from "#src/modules/campaigns/domain/entities/CampaignsTable";
export { CampaignsRepository } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
export { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";
