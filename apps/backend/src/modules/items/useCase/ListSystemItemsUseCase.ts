import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemItemsQueryDto } from "#src/modules/items/domain/dto/RequestItemDto";
import type { ItemListing } from "#src/modules/items/useCase/ItemListing";

/** Global items; drafts and archived ones for administrators only. */
export class ListSystemItemsUseCase {
  constructor(private readonly listing: ItemListing) {}

  execute(context: RequestContext, input: { query: RequestSystemItemsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
