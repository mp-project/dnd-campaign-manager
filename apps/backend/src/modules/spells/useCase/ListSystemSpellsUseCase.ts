import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemSpellsQueryDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { SpellListing } from "#src/modules/spells/useCase/SpellListing";

/** Global spells; drafts and archived ones for administrators only. */
export class ListSystemSpellsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSpellsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
