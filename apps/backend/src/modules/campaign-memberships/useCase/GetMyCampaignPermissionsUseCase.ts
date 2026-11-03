import type { RequestContext } from "#core/http/requestContext";
import type { CampaignMembershipPermissionsResponseDto } from "#src/modules/campaign-memberships/domain/dto/ResponseCampaignMembershipPermissionsDto";
import {
  CAMPAIGN_MEMBERSHIP_PERMISSIONS,
  CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS,
} from "#src/modules/campaign-memberships/permissions/CampaignMembershipsPermissions";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";

/**
 * Returns the membership permissions of the current user in a campaign.
 */
export class GetMyCampaignPermissionsUseCase {
  constructor(private readonly membershipsService: CampaignMembershipsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
  ): Promise<CampaignMembershipPermissionsResponseDto> {
    const { canManage } = await this.membershipsService.resolveMemberAccess(context, campaignId);

    return {
      permissions: canManage
        ? [...CAMPAIGN_MEMBERSHIP_PERMISSION_KEYS]
        : [CAMPAIGN_MEMBERSHIP_PERMISSIONS.read],
    };
  }
}
