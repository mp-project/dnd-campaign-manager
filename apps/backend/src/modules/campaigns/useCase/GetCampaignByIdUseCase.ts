import type { RequestContext } from "#core/http/requestContext";
import { NotFoundError } from "#core/error/http/index";
import { isSysAdminRole } from "#core/permissions/roles";
import type { CampaignAggregate } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class GetCampaignByIdUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(context: RequestContext, campaignId: string): Promise<CampaignAggregate> {
    const actorId = this.campaignsService.assertAuthenticated(context);
    const campaign = await this.campaignsService.repository.findCampaignById(
      this.campaignsService.db,
      campaignId,
    );

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    const membership = await this.campaignsService.repository.findMembership(
      this.campaignsService.db,
      campaignId,
      actorId,
    );
    const isOwner = campaign.ownerUserId === actorId;

    if (!isOwner && !membership && !isSysAdminRole(context.systemRole)) {
      throw new NotFoundError("Campaign not found");
    }

    const aggregate: CampaignAggregate = {
      campaign,
      membership,
      isOwner: false,
      effectivePermissions: [],
    };

    return this.campaignsService.attachEffectivePermissions(context, aggregate);
  }
}
