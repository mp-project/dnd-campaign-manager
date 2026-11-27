import type { RequestContext } from "#core/http/requestContext";
import type { RequestSpellCatalogQueryDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { SpellListing } from "#src/modules/spells/useCase/SpellListing";

/** What a campaign may use: active global spells for its ruleset and its own spells. */
export class ListSpellCatalogUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestSpellCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}
