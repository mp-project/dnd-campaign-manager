import type { RequestContext } from "#core/http/requestContext";
import type { RequestCampaignSpeciesQueryDto } from "#src/modules/species/domain/dto/RequestSpeciesDto";
import type { SpeciesListing } from "#src/modules/species/useCase/SpeciesListing";

/** Custom species of a campaign. */
export class ListCampaignSpeciesUseCase {
  constructor(private readonly listing: SpeciesListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignSpeciesQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}
