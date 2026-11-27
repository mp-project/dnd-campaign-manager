import type { RequestContext } from "#core/http/requestContext";
import type { RequestCampaignSpellsQueryDto } from "#src/modules/spells/domain/dto/RequestSpellDto";
import type { SpellListing } from "#src/modules/spells/useCase/SpellListing";

/** Custom spells of a campaign. */
export class ListCampaignSpellsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignSpellsQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}
