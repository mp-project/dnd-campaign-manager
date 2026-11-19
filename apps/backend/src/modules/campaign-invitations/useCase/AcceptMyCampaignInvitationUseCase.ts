import type { HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AcceptCampaignInvitationResponseDto } from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import type { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Accepts an invitation from the account's own list by its id, without the email's token: for
 * people invited by their user tag or who lost the email. Same checks as accepting by token
 * (`CampaignInvitationsService.acceptInvitation`): only the invited, verified account may.
 */
export class AcceptMyCampaignInvitationUseCase {
  constructor(
    private readonly history: HistoryPort,
    private readonly invitationsService: CampaignInvitationsService,
  ) {}

  async execute(context: RequestContext, invitationId: string): Promise<AcceptCampaignInvitationResponseDto> {
    const service = this.invitationsService;
    return service.acceptInvitation(this.history, context, (tx) => service.repository.findByIdForUpdate(tx, invitationId));
  }
}
