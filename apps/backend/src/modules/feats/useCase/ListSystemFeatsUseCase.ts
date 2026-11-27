import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemFeatsQueryDto } from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { FeatListing } from "#src/modules/feats/useCase/FeatListing";

/** Global feats; drafts and archived ones for administrators only. */
export class ListSystemFeatsUseCase {
  constructor(private readonly listing: FeatListing) {}

  execute(context: RequestContext, input: { query: RequestSystemFeatsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
