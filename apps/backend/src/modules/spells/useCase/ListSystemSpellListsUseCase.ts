import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemSpellListsQueryDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { SpellListing } from "#src/modules/spells/useCase/SpellListing";

/** Global spell lists; drafts and archived ones for administrators only. */
export class ListSystemSpellListsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSpellListsQueryDto }) {
    return this.listing.listSystemLists(context, input.query);
  }
}
