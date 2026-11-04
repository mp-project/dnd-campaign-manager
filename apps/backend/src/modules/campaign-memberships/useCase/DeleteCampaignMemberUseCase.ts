import type { AppDatabase } from "#core/db/pool";
import { ConflictError } from "#core/error/http/index";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import { CAMPAIGN_MEMBERSHIP_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaignMembership";

export type DeleteCampaignMemberInput = {
  campaignId: string;
  memberId: string;
};

/**
 * Revokes a membership (status `REVOKED`); the owner and the last editor cannot be removed.
 */
export class DeleteCampaignMemberUseCase extends MutationUseCase<DeleteCampaignMemberInput, void> {
  protected readonly action = CAMPAIGN_MEMBERSHIP_ACTIONS.revoke;

  constructor(
    history: HistoryPort,
    private readonly membershipsService: CampaignMembershipsService,
  ) {
    super(history);
  }

  protected override async prepare(context: RequestContext): Promise<void> {
    await this.membershipsService.requireActorId(context);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteCampaignMemberInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.membershipsService.lockForManagement(db, context, input.campaignId);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: DeleteCampaignMemberInput,
  ): Promise<void> {
    const { repository, trackedMembership } = this.membershipsService;
    const { campaignId, memberId } = input;
    const { member, campaign } = await this.membershipsService.loadManagedMember(
      scope.tx,
      campaignId,
      memberId,
    );

    if (member.userId === campaign.ownerUserId) {
      throw new ConflictError("Campaign owner cannot be removed");
    }

    if (
      member.role === "EDITOR" &&
      (await repository.countActiveEditors(scope.tx, campaignId)) <= 1
    ) {
      throw new ConflictError("Campaign must retain at least one active editor");
    }

    await scope.change(trackedMembership, memberId, () => ({
      set: { status: "REVOKED", revokedAt: new Date(), revokedBy: context.actorId },
    }));
  }
}
