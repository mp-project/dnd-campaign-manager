import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseCampaignDto,
  toCampaignResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class GetCampaignByIdUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(context: RequestContext, campaignId: string): Promise<ResponseCampaignDto> {
    const actorId = await this.campaignsService.requireActorId(context);
    const { campaign, membership } = await this.campaignsService.loadReadableCampaign(
      context,
      actorId,
      campaignId,
    );

    return toCampaignResponse(
      this.campaignsService.buildAggregate(context, campaign, membership),
    );
  }
}
