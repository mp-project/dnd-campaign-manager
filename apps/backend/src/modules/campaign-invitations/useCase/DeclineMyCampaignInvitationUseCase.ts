import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

/**
 * Declines an invitation of the account's own list. It ends like a revoked one (`REVOKED`, with the
 * invited account as `updatedBy`): the campaign's list shows only pending invitations, and the
 * game master may invite again. Like accepting: a foreign or unknown invitation is 404 before
 * anything else, an own one that can't be answered any more a 409 with `details.reason`.
 */
export class DeclineMyCampaignInvitationUseCase {
  constructor(private readonly invitationsService: CampaignInvitationsService) {}

  async execute(context: RequestContext, invitationId: string): Promise<void> {
    const service = this.invitationsService;
    const user = await service.requireAuthenticatedUser(context);
    const now = new Date();

    const outcome = await service.transactionManager.inTransaction(async (tx) => {
      const invitation = await service.repository.findByIdForUpdate(tx, invitationId);

      if (!invitation || !service.isAddressedTo(invitation, user)) {
        return "not_found" as const;
      }

      const closed = service.closedReason(invitation, now);
      if (closed) return closed;

      const declined = await service.repository.updateStatus(tx, {
        status: "REVOKED",
        campaignId: invitation.campaignId,
        invitationId: invitation.id,
        actorId: user.id,
        now,
      });
      return declined ? { campaignId: invitation.campaignId } : ("changed" as const);
    });

    if (outcome === "not_found") {
      throw new NotFoundError("Campaign invitation not found");
    }
    if (typeof outcome === "string") {
      throw service.closedError(outcome);
    }

    service.recordChange({
      action: "campaignInvitations.decline",
      invitationId,
      campaignId: outcome.campaignId,
      actorId: user.id,
      values: { status: "REVOKED" },
    });
  }
}
