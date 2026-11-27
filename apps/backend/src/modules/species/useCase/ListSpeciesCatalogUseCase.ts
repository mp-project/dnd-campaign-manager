import type { RequestContext } from "#core/http/requestContext";
import type { RequestSpeciesCatalogQueryDto } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { SpeciesListing } from "#src/modules/species/useCase/SpeciesListing";

/** What a campaign may use: active global species for its ruleset and its own species. */
export class ListSpeciesCatalogUseCase {
  constructor(private readonly listing: SpeciesListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestSpeciesCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}
