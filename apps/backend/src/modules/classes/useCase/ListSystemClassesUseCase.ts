import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemClassesQueryDto } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { ClassListing } from "#src/modules/classes/useCase/ClassListing";

/** Global classes; drafts and archived ones for administrators only. */
export class ListSystemClassesUseCase {
  constructor(private readonly listing: ClassListing) {}

  execute(context: RequestContext, input: { query: RequestSystemClassesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
