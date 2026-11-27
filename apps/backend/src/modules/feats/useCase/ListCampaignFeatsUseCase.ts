import type { RequestContext } from "#core/http/requestContext";
import type { RequestCampaignFeatsQueryDto } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { FeatListing } from "#src/modules/feats/useCase/FeatListing";

/** Custom feats of a campaign. */
export class ListCampaignFeatsUseCase {
  constructor(private readonly listing: FeatListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignFeatsQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}
