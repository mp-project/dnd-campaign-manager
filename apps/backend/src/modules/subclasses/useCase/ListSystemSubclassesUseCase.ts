import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemSubclassesQueryDto } from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { SubclassListing } from "#src/modules/subclasses/useCase/SubclassListing";

/** Global subclasses; drafts and archived ones for administrators only. */
export class ListSystemSubclassesUseCase {
  constructor(private readonly listing: SubclassListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSubclassesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
