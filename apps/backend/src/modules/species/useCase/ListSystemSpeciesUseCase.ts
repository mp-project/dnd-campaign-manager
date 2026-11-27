import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemSpeciesQueryDto } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { SpeciesListing } from "#src/modules/species/useCase/SpeciesListing";

/** Global species; drafts and archived ones for administrators only. */
export class ListSystemSpeciesUseCase {
  constructor(private readonly listing: SpeciesListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSpeciesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
