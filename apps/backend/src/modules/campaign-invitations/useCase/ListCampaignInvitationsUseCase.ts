import type { RequestContext } from "#core/http/requestContext";
import {
  type CampaignInvitationListResponseDto,
  toCampaignInvitationListResponse,
} from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Lists the pending invitations of a campaign; expired ones are marked first.
 */
export class ListCampaignInvitationsUseCase {
  constructor(private readonly invitationsService: CampaignInvitationsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
  ): Promise<CampaignInvitationListResponseDto> {
    await this.invitationsService.assertOwnerOrSysAdmin(context, campaignId);
    const { db, repository, transactionManager } = this.invitationsService;
    const now = new Date();

    await transactionManager.inTransaction((tx) => repository.updateExpired(tx, now, campaignId));

    const invitations = await repository.listPendingByCampaign(db, campaignId, now);
    const userTagById = await this.invitationsService.listUserTagsById(
      invitations.flatMap((invitation) =>
        invitation.targetUserId ? [invitation.targetUserId] : [],
      ),
    );

    return toCampaignInvitationListResponse(invitations, userTagById);
  }
}
