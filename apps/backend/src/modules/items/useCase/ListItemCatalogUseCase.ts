import type { RequestContext } from "#core/http/requestContext";
import type { RequestItemCatalogQueryDto } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ItemListing } from "#src/modules/items/useCase/ItemListing";

/** What a campaign may use: active global items for its ruleset and its own items. */
export class ListItemCatalogUseCase {
  constructor(private readonly listing: ItemListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestItemCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}
