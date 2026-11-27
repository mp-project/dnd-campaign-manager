import type { RequestContext } from "#core/http/requestContext";
import type { RequestCampaignSpellListsQueryDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { SpellListing } from "#src/modules/spells/useCase/SpellListing";

/** Custom spell lists of a campaign. */
export class ListCampaignSpellListsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignSpellListsQueryDto }) {
    return this.listing.listCampaignLists(context, input);
  }
}
