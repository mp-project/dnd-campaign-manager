import type { RequestContext } from "#core/http/requestContext";
import {
  type CampaignMemberListResponseDto,
  toCampaignMemberListResponse,
} from "#src/modules/campaign-memberships/domain/dto/ResponseCampaignMembershipDto";
import { CampaignMembershipsService } from "#src/modules/campaign-memberships/service/CampaignMembershipsService";

/**
 * Lists active members; managers get the full view, players the reduced one.
 */
export class ListCampaignMembersUseCase {
  constructor(private readonly membershipsService: CampaignMembershipsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
  ): Promise<CampaignMemberListResponseDto> {
    const { canManage } = await this.membershipsService.resolveMemberAccess(context, campaignId);
    const members = await this.membershipsService.listMembers(campaignId);

    return toCampaignMemberListResponse(members, canManage);
  }
}
