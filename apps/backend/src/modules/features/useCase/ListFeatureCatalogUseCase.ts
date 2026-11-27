import type { RequestContext } from "#core/http/requestContext";
import type { RequestFeatureCatalogQueryDto } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { FeatureListing } from "#src/modules/features/useCase/FeatureListing";

/** What a campaign may use: active global features for its ruleset and its own features. */
export class ListFeatureCatalogUseCase {
  constructor(private readonly listing: FeatureListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestFeatureCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}
