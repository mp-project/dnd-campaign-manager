import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseCampaignTimeHistoryDto,
  toCampaignTimeHistoryResponse,
} from "#src/modules/campaigns/domain/dto/ResponseCampaignDto";
import { CampaignsService } from "#src/modules/campaigns/service/CampaignsService";

export class GetCampaignTimeHistoryUseCase {
  constructor(private readonly campaignsService: CampaignsService) {}

  async execute(
    context: RequestContext,
    campaignId: string,
    limit: number,
  ): Promise<ResponseCampaignTimeHistoryDto> {
    const { db, repository } = this.campaignsService;
    const actorId = await this.campaignsService.requireActorId(context);

    await this.campaignsService.loadReadableCampaign(context, actorId, campaignId);

    const events = await repository.listTimeEvents(db, campaignId, limit);

    return toCampaignTimeHistoryResponse(events, limit);
  }
}
