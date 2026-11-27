import type { RequestContext } from "#core/http/requestContext";
import type { RequestSpellCatalogQueryDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { SpellListing } from "#src/modules/spells/useCase/SpellListing";

/**
 * The spells of one list in the catalog of the campaign: its own entries and the spells that name
 * it, with the filters of the spell catalog.
 */
export class ListSpellListSpellsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; spellListId: string; query: RequestSpellCatalogQueryDto },
  ) {
    return this.listing.listCatalog(context, {
      campaignId: input.campaignId,
      query: { ...input.query, list: input.spellListId },
    });
  }
}
