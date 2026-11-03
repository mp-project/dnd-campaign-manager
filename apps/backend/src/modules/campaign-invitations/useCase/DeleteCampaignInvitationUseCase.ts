import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Revokes a pending invitation (status `REVOKED`).
 */
export class DeleteCampaignInvitationUseCase {
  constructor(private readonly invitationsService: CampaignInvitationsService) {}

  async execute(context: RequestContext, campaignId: string, invitationId: string): Promise<void> {
    const { actorId } = await this.invitationsService.assertOwnerOrSysAdmin(context, campaignId);
    const revoked = await this.invitationsService.repository.updateStatus(
      this.invitationsService.db,
      { status: "REVOKED", campaignId, invitationId, actorId, now: new Date() },
    );

    if (!revoked) {
      throw new NotFoundError("Pending campaign invitation not found");
    }
  }
}
