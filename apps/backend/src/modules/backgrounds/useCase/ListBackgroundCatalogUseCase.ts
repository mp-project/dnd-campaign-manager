import type { RequestContext } from "#core/http/requestContext";
import type {
  RequestBackgroundCatalogQueryDto,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import type { BackgroundListing } from "#src/modules/backgrounds/useCase/BackgroundListing";

/** What a campaign may use: active global backgrounds for its ruleset and its own backgrounds. */
export class ListBackgroundCatalogUseCase {
  constructor(private readonly listing: BackgroundListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestBackgroundCatalogQueryDto },
  ) {
    return this.listing.listCatalog(context, input);
  }
}
