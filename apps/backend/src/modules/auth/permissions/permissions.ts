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
  ASSET_LINKS_PERMISSION_KEYS,
  ASSET_LINKS_USER_PERMISSION_KEYS,
} from "#src/modules/asset-links/permissions/AssetLinksPermissions";
import {
  TAGS_PERMISSION_KEYS,
  TAGS_USER_PERMISSION_KEYS,
} from "#src/modules/tags/permissions/TagsPermissions";
import {
  MEDIA_PERMISSION_KEYS,
  MEDIA_USER_PERMISSION_KEYS,
} from "#src/modules/media/permissions/MediaPermissions";
import {
  CONTENT_SHARES_PERMISSION_KEYS,
  CONTENT_SHARES_USER_PERMISSION_KEYS,
} from "#src/modules/content-shares/permissions/ContentSharesPermissions";
import {
  NOTES_PERMISSION_KEYS,
  NOTES_USER_PERMISSION_KEYS,
} from "#src/modules/notes/permissions/NotesPermissions";
import {
  FEATURES_PERMISSION_KEYS,
  FEATURES_USER_PERMISSION_KEYS,
} from "#src/modules/features/permissions/FeaturesPermissions";
import {
  CLASSES_PERMISSION_KEYS,
  CLASSES_USER_PERMISSION_KEYS,
} from "#src/modules/classes/permissions/ClassesPermissions";
import {
  SPECIES_PERMISSION_KEYS,
  SPECIES_USER_PERMISSION_KEYS,
} from "#src/modules/species/permissions/SpeciesPermissions";
import {
  FEATS_PERMISSION_KEYS,
  FEATS_USER_PERMISSION_KEYS,
} from "#src/modules/feats/permissions/FeatsPermissions";
import {
  HISTORY_PERMISSION_KEYS,
  HISTORY_USER_PERMISSION_KEYS,
} from "#src/modules/history/permissions/HistoryPermissions";
import {
  USERS_PERMISSIONS,
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
  USERS_PERMISSIONS.read,
  ...RULESET_READ_PERMISSION_KEYS,
  ...CAMPAIGNS_USER_PERMISSION_KEYS,
  ...CAMPAIGN_MEMBERSHIP_USER_PERMISSION_KEYS,
  ...CAMPAIGN_INVITATION_PERMISSION_KEYS,
  ...ASSETS_USER_PERMISSION_KEYS,
  ...ASSET_LINKS_USER_PERMISSION_KEYS,
  ...TAGS_USER_PERMISSION_KEYS,
  ...MEDIA_USER_PERMISSION_KEYS,
  ...CONTENT_SHARES_USER_PERMISSION_KEYS,
  ...NOTES_USER_PERMISSION_KEYS,
  ...FEATURES_USER_PERMISSION_KEYS,
  ...CLASSES_USER_PERMISSION_KEYS,
  ...SPECIES_USER_PERMISSION_KEYS,
  ...FEATS_USER_PERMISSION_KEYS,
  ...HISTORY_USER_PERMISSION_KEYS,
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
  ...ASSET_LINKS_PERMISSION_KEYS,
  ...TAGS_PERMISSION_KEYS,
  ...MEDIA_PERMISSION_KEYS,
  ...CONTENT_SHARES_PERMISSION_KEYS,
  ...NOTES_PERMISSION_KEYS,
  ...FEATURES_PERMISSION_KEYS,
  ...CLASSES_PERMISSION_KEYS,
  ...SPECIES_PERMISSION_KEYS,
  ...FEATS_PERMISSION_KEYS,
  ...HISTORY_PERMISSION_KEYS,
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
