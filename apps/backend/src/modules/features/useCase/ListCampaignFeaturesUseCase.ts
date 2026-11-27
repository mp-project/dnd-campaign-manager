import type { RequestContext } from "#core/http/requestContext";
import type { RequestCampaignFeaturesQueryDto } from "#src/modules/features/domain/dto/RequestFeatureDto";
import type { FeatureListing } from "#src/modules/features/useCase/FeatureListing";

/** Custom features of a campaign. */
export class ListCampaignFeaturesUseCase {
  constructor(private readonly listing: FeatureListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignFeaturesQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}
