import type { HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AcceptCampaignInvitationResponseDto } from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Accepts an invitation for the authenticated user with the matching verified email and creates
 * the membership, by the one-time token of the invitation email. Accepting again returns the
 * existing membership. The checks live in `CampaignInvitationsService.acceptInvitation`, shared
 * with accepting by id from the account's own list.
 */
export class AcceptCampaignInvitationUseCase {
  constructor(
    private readonly history: HistoryPort,
    private readonly invitationsService: CampaignInvitationsService,
  ) {}

  async execute(context: RequestContext, token: string): Promise<AcceptCampaignInvitationResponseDto> {
    const service = this.invitationsService;
    return service.acceptInvitation(this.history, context, (tx) =>
      service.repository.findByTokenHashForUpdate(tx, service.hashToken(token)),
    );
  }
}
