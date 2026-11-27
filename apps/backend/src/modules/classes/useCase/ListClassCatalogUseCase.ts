import type { RequestContext } from "#core/http/requestContext";
import type { RequestClassCatalogQueryDto } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { ClassListing } from "#src/modules/classes/useCase/ClassListing";

/** What a campaign may use: active global classes for its ruleset and its own classes. */
export class ListClassCatalogUseCase {
  constructor(private readonly listing: ClassListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestClassCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}
