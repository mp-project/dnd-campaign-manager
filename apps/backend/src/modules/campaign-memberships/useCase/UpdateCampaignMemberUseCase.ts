import { ConflictError, VersionConflictError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import {
  type CampaignMembershipResponseDto,
  toCampaignMembershipResponse,
} from "#src/modules/campaign-memberships/domain/dto/ResponseCampaignMembershipDto";
import type { UpdateCampaignMembershipRoleDto } from "#src/modules/campaign-memberships/domain/dto/UpdateCampaignMembershipDto";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";

/**
 * Changes a member's role; the owner stays an editor and the campaign keeps at least one editor.
 */
export class UpdateCampaignMemberUseCase {
  constructor(private readonly membershipsService: CampaignMembershipsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    memberId: string,
    input: UpdateCampaignMembershipRoleDto,
  ): Promise<CampaignMembershipResponseDto> {
    const { repository, transactionManager } = this.membershipsService;
    const actorId = await this.membershipsService.requireActorId(context);

    const updated = await transactionManager.inTransaction(async (tx) => {
      const { member, campaign } = await this.membershipsService.loadManagedMember(
        tx,
        context,
        actorId,
        campaignId,
        memberId,
      );

      if (member.userId === campaign.ownerUserId && input.role !== "EDITOR") {
        throw new ConflictError("Campaign owner must remain an editor");
      }

      if (
        member.role === "EDITOR" &&
        input.role !== "EDITOR" &&
        (await repository.countActiveEditors(tx, campaignId)) <= 1
      ) {
        throw new ConflictError("Campaign must retain at least one active editor");
      }

      const result = await repository.update(tx, {
        campaignId,
        membershipId: memberId,
        actorId,
        expectedVersion: input.expectedVersion,
        role: input.role,
      });

      if (!result) {
        throw new VersionConflictError("Campaign membership version mismatch");
      }

      return result;
    });

    return toCampaignMembershipResponse(updated);
  }
}
