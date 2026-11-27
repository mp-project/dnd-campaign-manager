import type { RequestContext } from "#core/http/requestContext";
import type { RequestCampaignClassesQueryDto } from "#src/modules/classes/domain/dto/RequestClassDto";
import type { ClassListing } from "#src/modules/classes/useCase/ClassListing";

/** Custom classes of a campaign. */
export class ListCampaignClassesUseCase {
  constructor(private readonly listing: ClassListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignClassesQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}
