import { ConflictError, InternalError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateCampaignInvitationDto } from "#src/modules/campaign-invitations/domain/dto/CreateCampaignInvitationDto";
import {
  type CampaignInvitationResponseDto,
  toCampaignInvitationResponse,
} from "#src/modules/campaign-invitations/domain/dto/ResponseCampaignInvitationDto";
import { CampaignInvitationsService } from "#src/modules/campaign-invitations/service/CampaignInvitationsService";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a pending invitation and emails a one-time token link; the token itself is never returned.
 * If the email cannot be delivered, the invitation is revoked again.
 */
export class CreateCampaignInvitationUseCase {
  constructor(private readonly invitationsService: CampaignInvitationsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    input: CreateCampaignInvitationDto,
  ): Promise<CampaignInvitationResponseDto> {
    const { actorId, campaignName } = await this.invitationsService.assertOwnerOrSysAdmin(
      context,
      campaignId,
    );
    this.invitationsService.assertEmailAvailable();

    const target = await this.invitationsService.resolveTarget(input);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + input.expiresInDays * DAY_MS);

    if (target.userId) {
      await this.invitationsService.assertNotMember(campaignId, target.userId);
    }

    const { token, tokenHash } = this.invitationsService.createToken();
    const { repository } = this.invitationsService;
    let invitation;

    try {
      invitation = await this.invitationsService.transactionManager.inTransaction(async (tx) => {
        await repository.updateExpired(tx, now, campaignId);

        const existing = await repository.findPendingByCampaignEmail(tx, campaignId, target.email);

        if (existing) {
          throw new ConflictError("A pending invitation already exists for this email");
        }

        return repository.create(tx, {
          campaignId,
          email: target.email,
          targetUserId: target.userId,
          role: input.role,
          tokenHash,
          expiresAt,
          actorId,
        });
      });
    } catch (error) {
      if (this.invitationsService.isUniqueViolation(error)) {
        throw new ConflictError("A pending invitation already exists for this email");
      }

      throw error;
    }

    try {
      await this.invitationsService.sendInvitationEmail({
        to: target.email,
        campaignName,
        role: input.role,
        expiresAt,
        token,
      });
    } catch {
      await this.invitationsService.transactionManager.inTransaction((tx) =>
        repository.updateStatus(tx, {
          status: "REVOKED",
          campaignId,
          invitationId: invitation.id,
          actorId,
          now: new Date(),
        }),
      );

      throw new InternalError("Failed to deliver campaign invitation email");
    }

    return toCampaignInvitationResponse(invitation, target.userTag);
  }
}
