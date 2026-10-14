export { campaignInvitationsModule } from "#src/modules/campaign-invitations/Setup";
export {
  CAMPAIGN_INVITATIONS_MODULE_DEPENDENCIES,
  type CampaignInvitationsModuleDependencies,
} from "#src/modules/campaign-invitations/Setup";
export { campaignInvitations } from "#src/modules/campaign-invitations/domain/entities/CampaignInvitationsTable";
export { CampaignInvitationsRepository } from "#src/modules/campaign-invitations/domain/repository/CampaignInvitationsRepository";
export { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";
export {
  CAMPAIGN_INVITATION_PERMISSION_KEYS,
  campaignInvitationPermissionDefinitions,
} from "#src/modules/campaign-invitations/permissions/CampaignInvitationsPermissions";