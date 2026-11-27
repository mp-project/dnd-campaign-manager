import type { RequestContext } from "#core/http/requestContext";
import type {
  RequestCampaignSubclassesQueryDto,
} from "#src/modules/subclasses/domain/dto/RequestSubclassDto";
import type { SubclassListing } from "#src/modules/subclasses/useCase/SubclassListing";

/** Custom subclasses of a campaign. */
export class ListCampaignSubclassesUseCase {
  constructor(private readonly listing: SubclassListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignSubclassesQueryDto },
  ) {
    return this.listing.listCampaign(context, input);
  }
}
