import type { RequestContext } from "#core/http/requestContext";
import { NotFoundError } from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CampaignTimeEventRow } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class GetCampaignTimeHistoryUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    limit: number,
  ): Promise<CampaignTimeEventRow[]> {
    const actorId = this.campaignsService.assertAuthenticated(context);
    const current = await this.campaignsService.repository.findCampaignById(
      this.campaignsService.db,
      campaignId,
    );

    if (!current) {
      throw new NotFoundError("Campaign not found");
    }

    const membership = await this.campaignsService.repository.findMembership(
      this.campaignsService.db,
      campaignId,
      actorId,
    );
    const isOwner = current.ownerUserId === actorId;

    if (!isOwner && !membership && !isSysAdminRole(context.systemRole)) {
      throw new NotFoundError("Campaign not found");
    }

    return this.campaignsService.repository.listTimeEvents(this.campaignsService.db, campaignId, limit);
  }
}
