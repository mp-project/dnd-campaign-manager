import type { RequestContext } from "#core/http/requestContext";
import type { RequestSpellListCatalogQueryDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { SpellListing } from "#src/modules/spells/useCase/SpellListing";

/** What a campaign may use: active global lists for its ruleset and its own lists. */
export class ListSpellListCatalogUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestSpellListCatalogQueryDto }) {
    return this.listing.listListCatalog(context, input);
  }
}
