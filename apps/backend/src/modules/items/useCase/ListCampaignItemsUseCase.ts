import type { RequestContext } from "#core/http/requestContext";
import type { RequestCampaignItemsQueryDto } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ItemListing } from "#src/modules/items/useCase/ItemListing";

/** Custom items of a campaign. */
export class ListCampaignItemsUseCase {
  constructor(private readonly listing: ItemListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignItemsQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}
