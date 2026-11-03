import type { RequestContext } from "#core/http/requestContext";
import type { CampaignInvitationTargetResponseDto } from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Checks that a userTag belongs to an active non-member; exposes neither user id nor email.
 */
export class LookupCampaignInvitationTargetUseCase {
  constructor(private readonly invitationsService: CampaignInvitationsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    userTag: string,
  ): Promise<CampaignInvitationTargetResponseDto> {
    await this.invitationsService.assertOwnerOrSysAdmin(context, campaignId);
    const user = await this.invitationsService.findActiveUserByTag(userTag);
    await this.invitationsService.assertNotMember(campaignId, user.id);

    return { userTag: user.userTag, displayName: user.displayName };
  }
}
