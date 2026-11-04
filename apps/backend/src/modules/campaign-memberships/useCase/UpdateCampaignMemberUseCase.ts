import type { AppDatabase } from "#core/db/pool";
import { ConflictError } from "#core/error/http/index";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type UpdateCampaignMembershipResponseDto,
  toUpdateCampaignMembershipResponse,
} from "#src/modules/campaign-memberships/domain/dto/ResponseCampaignMembershipDto";
import type { UpdateCampaignMembershipRoleDto } from "#src/modules/campaign-memberships/domain/dto/UpdateCampaignMembershipDto";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";
import { CAMPAIGN_MEMBERSHIP_ACTIONS } from "#src/modules/campaigns/history/TrackedCampaignMembership";

export type UpdateCampaignMemberInput = {
  campaignId: string;
  memberId: string;
  command: UpdateCampaignMembershipRoleDto;
};

/**
 * Changes a member's role; the owner stays an editor and the campaign keeps at least one editor.
 */
export class UpdateCampaignMemberUseCase extends MutationUseCase<
  UpdateCampaignMemberInput,
  UpdateCampaignMembershipResponseDto
> {
  protected readonly action = CAMPAIGN_MEMBERSHIP_ACTIONS.updateRole;

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
    input: UpdateCampaignMemberInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.membershipsService.lockForManagement(db, context, input.campaignId);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: UpdateCampaignMemberInput,
  ): Promise<UpdateCampaignMembershipResponseDto> {
    const { repository, trackedMembership } = this.membershipsService;
    const { campaignId, memberId, command } = input;
    const { member, campaign } = await this.membershipsService.loadManagedMember(
      scope.tx,
      campaignId,
      memberId,
    );

    if (member.userId === campaign.ownerUserId && command.role !== "EDITOR") {
      throw new ConflictError("Campaign owner must remain an editor");
    }

    if (
      member.role === "EDITOR" &&
      command.role !== "EDITOR" &&
      (await repository.countActiveEditors(scope.tx, campaignId)) <= 1
    ) {
      throw new ConflictError("Campaign must retain at least one active editor");
    }

    const { row, merged } = await scope.change(trackedMembership, memberId, () => ({
      set: { role: command.role },
      baseVersion: command.expectedVersion,
    }));

    return toUpdateCampaignMembershipResponse(row, merged);
  }
}
