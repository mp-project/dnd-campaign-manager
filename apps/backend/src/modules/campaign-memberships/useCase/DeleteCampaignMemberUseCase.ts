import { ConflictError, VersionConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";

/**
 * Revokes a membership (status `REVOKED`); the owner and the last editor cannot be removed.
 */
export class DeleteCampaignMemberUseCase {
  constructor(private readonly membershipsService: CampaignMembershipsService) {}

  async execute(context: RequestContext, campaignId: string, memberId: string): Promise<void> {
    const { repository, transactionManager } = this.membershipsService;
    const actorId = await this.membershipsService.requireActorId(context);

    await transactionManager.inTransaction(async (tx) => {
      const { member, campaign } = await this.membershipsService.loadManagedMember(
        tx,
        context,
        actorId,
        campaignId,
        memberId,
      );

      if (member.userId === campaign.ownerUserId) {
        throw new ConflictError("Campaign owner cannot be removed");
      }

      if (member.role === "EDITOR" && (await repository.countActiveEditors(tx, campaignId)) <= 1) {
        throw new ConflictError("Campaign must retain at least one active editor");
      }

      const revoked = await repository.delete(tx, {
        campaignId,
        membershipId: memberId,
        actorId,
      });

      if (!revoked) {
        throw new VersionConflictError("Campaign membership changed concurrently");
      }
    });
  }
}
