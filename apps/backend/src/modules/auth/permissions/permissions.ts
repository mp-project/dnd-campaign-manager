import {
  AUTH_PERMISSION_KEYS,
} from "#src/modules/auth/permissions/AuthPermissions";
import {
  RULESET_PERMISSION_KEYS,
  RULESET_READ_PERMISSION_KEYS,
} from "#src/modules/ruleset/permissions/RulesetPermissions";
import {
  CAMPAIGNS_PERMISSION_KEYS,
  CAMPAIGNS_USER_PERMISSION_KEYS,
} from "#src/modules/campaigns/permissions/CampaignsPermissions";
import {
  CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS,
  CAMPAIGN_MEMBERSHIP_USER_PERMISSION_KEYS,
} from "#src/modules/campaign-memberships/permissions/CampaignMembershipsPermissions";
import {
  CAMPAIGN_INVITATION_PERMISSION_KEYS,
} from "#src/modules/campaign-invitations/permissions/CampaignInvitationsPermissions";
import {
  ASSETS_PERMISSION_KEYS,
  ASSETS_USER_PERMISSION_KEYS,
} from "#src/modules/assets/permissions/AssetsPermissions";
import {
  USERS_PERMISSION_KEYS,
  USERS_SELF_SERVICE_PERMISSION_KEYS,
} from "#src/modules/users/permissions/UsersPermissions";

export const CORE_PERMISSION_KEYS = [
  "campaign.crud",
  "campaign.special",
  "campaign.readShared",
  "character.createOwn",
  "character.readOwn",
  "character.updateOwn",
] as const;

export const APPLICATION_USER_PERMISSIONS: readonly Permission[] = [
  ...AUTH_PERMISSION_KEYS,
  ...USERS_SELF_SERVICE_PERMISSION_KEYS,
  USERS_PERMISSION_KEYS[2],
  ...RULESET_READ_PERMISSION_KEYS,
  ...CAMPAIGNS_USER_PERMISSION_KEYS,
  ...CAMPAIGN_MEMBERSHIP_USER_PERMISSION_KEYS,
  ...CAMPAIGN_INVITATION_PERMISSION_KEYS,
  ...ASSETS_USER_PERMISSION_KEYS,
];

export const ALL_PERMISSIONS = [
  ...CORE_PERMISSION_KEYS,
  ...AUTH_PERMISSION_KEYS,
  ...CAMPAIGNS_PERMISSION_KEYS,
  ...CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS,
  ...CAMPAIGN_INVITATION_PERMISSION_KEYS,
  ...USERS_PERMISSION_KEYS,
  ...RULESET_PERMISSION_KEYS,
  ...ASSETS_PERMISSION_KEYS,
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
