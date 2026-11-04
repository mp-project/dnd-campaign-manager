import { ConflictError, ForbiddenError, NotFoundError } from "#core/error/http/index";
import { authorized } from "#core/history/authorization";
import type { HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AcceptCampaignInvitationResponseDto } from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";
import { CAMPAIGN_MEMBERSHIP_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaignMembership";

/**
 * Accepts an invitation by its one-time token for the authenticated user with the matching
 * verified email and creates the membership. Accepting again returns the existing membership.
 */
export class AcceptCampaignInvitationUseCase {
  constructor(
    private readonly history: HistoryPort,
    private readonly invitationsService: CampaignInvitationsService,
  ) {}

  async execute(
    context: RequestContext,
    token: string,
  ): Promise<AcceptCampaignInvitationResponseDto> {
    const service = this.invitationsService;
    const user = await service.requireAuthenticatedUser(context);

    if (!user.emailVerifiedAt) {
      throw new ForbiddenError("A verified email is required to accept a campaign invitation");
    }

    const now = new Date();
    const outcome = await this.history.runAction(
      {
        action: CAMPAIGN_MEMBERSHIP_ACTIONS.join,
        context,
        // The actor is checked above, the token and the email against the locked invitation below.
        authorize: async () => authorized(),
      },
      async (scope) => {
        const { tx } = scope;
        const invitation = await service.repository.findByTokenHashForUpdate(
          tx,
          service.hashToken(token),
        );

        if (!invitation) {
          return { error: "not_found" as const };
        }

        if (invitation.status === "ACCEPTED" && invitation.acceptedBy === user.id) {
          const membership = await service.findActiveMembership(invitation.campaignId, user.id, tx);

          if (membership) {
            return { invitation, membership };
          }
        }

        if (invitation.status === "PENDING" && invitation.expiresAt <= now) {
          await service.repository.updateExpired(tx, now, invitation.campaignId);
          return { error: "expired" as const };
        }

        if (invitation.status !== "PENDING") {
          return { error: "not_found" as const };
        }

        if (
          user.email.toLowerCase() !== invitation.email.toLowerCase() ||
          (invitation.targetUserId !== null && invitation.targetUserId !== user.id)
        ) {
          return { error: "not_found" as const };
        }

        if (!(await service.findCampaign(tx, invitation.campaignId))) {
          return { error: "not_found" as const };
        }

        const membership =
          (await service.findActiveMembership(invitation.campaignId, user.id, tx)) ??
          (await service.createMembershipFromInvitation(scope, {
            campaignId: invitation.campaignId,
            userId: user.id,
            role: invitation.role,
          }));

        const accepted = await service.repository.updateStatus(tx, {
          status: "ACCEPTED",
          invitationId: invitation.id,
          actorId: user.id,
          now,
        });

        if (!accepted) {
          throw new ConflictError("Campaign invitation changed while being accepted");
        }

        return { invitation, membership };
      },
    );

    if ("error" in outcome) {
      if (outcome.error === "expired") {
        throw new ConflictError("Campaign invitation has expired");
      }

      throw new NotFoundError("Campaign invitation not found");
    }

    return {
      campaignId: outcome.invitation.campaignId,
      membershipId: outcome.membership.id,
      role: outcome.membership.role,
    };
  }
}
