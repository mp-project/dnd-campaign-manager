import type { RequestContext } from "#core/http/requestContext";
import {
  type MyCampaignInvitationListResponseDto,
  toMyCampaignInvitationListResponse,
} from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Lists the pending invitations addressed to the current user (by user id, or by email once the
 * address is verified).
 */
export class ListMyCampaignInvitationsUseCase {
  constructor(private readonly invitationsService: CampaignInvitationsService) {}

  async execute(context: RequestContext): Promise<MyCampaignInvitationListResponseDto> {
    const user = await this.invitationsService.requireAuthenticatedUser(context);
    const { db, repository, transactionManager } = this.invitationsService;
    const now = new Date();

    await transactionManager.inTransaction((tx) => repository.updateExpired(tx, now));

    const invitations = await repository.listPendingForUser(db, {
      userId: user.id,
      // Only a verified address may see invitations sent to it.
      email: user.emailVerifiedAt ? user.email.toLowerCase() : null,
      now,
    });

    return toMyCampaignInvitationListResponse(invitations);
  }
}
