import type { RequestContext } from "#core/http/requestContext";
import {
  type MyCampaignInvitationListResponseDto,
  toMyCampaignInvitationListResponse,
} from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Lists the pending invitations addressed to the current user (by user id, or by email once the
 * address is verified), with the campaign's name and who invited them.
 */
export class ListMyCampaignInvitationsUseCase {
  constructor(private readonly invitationsService: CampaignInvitationsService) {}

  async execute(context: RequestContext): Promise<MyCampaignInvitationListResponseDto> {
    const user = await this.invitationsService.requireAuthenticatedUser(context);
    const { db, repository } = this.invitationsService;
    // Expired ones are left out by the query; marking them is the campaign's list's business.
    const now = new Date();

    const invitations = await repository.listPendingForUser(db, {
      userId: user.id,
      // Only a verified address may see invitations sent to it.
      email: user.emailVerifiedAt ? user.email.toLowerCase() : null,
      now,
    });

    const open = await this.invitationsService.withoutMemberships(invitations, user.id);

    return toMyCampaignInvitationListResponse(await this.invitationsService.describeForInvitee(open));
  }
}
