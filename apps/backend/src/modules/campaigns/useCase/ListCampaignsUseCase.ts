import type { RequestContext } from "#core/http/requestContext";
import { UnauthenticatedError } from "#core/error/http/index";
import type { RequestCampaignDto } from "#src/modules/campaigns/domain/dto/RequestCampaignDto";
import type { CampaignAggregate } from "#src/modules/campaigns/domain/repository/CampaignsRepository";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class ListCampaignsUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    filter: RequestCampaignDto["listQuery"],
  ): Promise<{ items: CampaignAggregate[]; total: number }> {
    const campaignUserService = this.campaignsService.campaignUserService;

    if (!campaignUserService) {
      throw new UnauthenticatedError("Authenticated user not found");
    }

    const requestedUserId = await campaignUserService.resolveAccessibleUserId(
      context,
      filter.userId,
    );

    const listFilter: RequestCampaignDto["listQuery"] = {
      ...filter,
      userId: undefined,
    };

    const [items, total] = await Promise.all([
      this.campaignsService.repository.listForActor(
        this.campaignsService.db,
        requestedUserId,
        listFilter,
      ),
      this.campaignsService.repository.countForActor(
        this.campaignsService.db,
        requestedUserId,
        listFilter,
      ),
    ]);

    return {
      items: items.map((item) => this.campaignsService.attachEffectivePermissions(context, item)),
      total,
    };
  }
}
