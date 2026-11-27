import type { RequestContext } from "#core/http/requestContext";
import type { RequestFeatCatalogQueryDto } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { FeatListing } from "#src/modules/feats/useCase/FeatListing";

/** What a campaign may use: active global feats for its ruleset and its own feats. */
export class ListFeatCatalogUseCase {
  constructor(private readonly listing: FeatListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestFeatCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}
