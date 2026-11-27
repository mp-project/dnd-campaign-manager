import type { RequestContext } from "#core/http/requestContext";
import type {
  RequestCampaignBackgroundsQueryDto,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { BackgroundListing } from "#src/modules/backgrounds/useCase/BackgroundListing";

/** Custom backgrounds of a campaign. */
export class ListCampaignBackgroundsUseCase {
  constructor(private readonly listing: BackgroundListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignBackgroundsQueryDto },
  ) {
    return this.listing.listCampaign(context, input);
  }
}
