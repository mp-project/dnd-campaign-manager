import type { RequestContext } from "#core/http/requestContext";
import type { RequestSystemFeaturesQueryDto } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { FeatureListing } from "#src/modules/features/useCase/FeatureListing";

/** Global features; drafts and archived ones for administrators only. */
export class ListSystemFeaturesUseCase {
  constructor(private readonly listing: FeatureListing) {}

  execute(context: RequestContext, input: { query: RequestSystemFeaturesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
