import type { RequestContext } from "#core/http/requestContext";
import type {
  RequestSystemBackgroundsQueryDto,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { BackgroundListing } from "#src/modules/backgrounds/useCase/BackgroundListing";

/** Global backgrounds; drafts and archived ones for administrators only. */
export class ListSystemBackgroundsUseCase {
  constructor(private readonly listing: BackgroundListing) {}

  execute(context: RequestContext, input: { query: RequestSystemBackgroundsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
