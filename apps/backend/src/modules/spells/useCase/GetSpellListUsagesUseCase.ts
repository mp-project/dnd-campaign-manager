import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";
import type { SpellReader } from "#src/modules/spells/useCase/SpellReader";

/**
 * Where a spell list is used in the current campaign, such as classes using it. Players only see
 * usages whose other end they may see as well. `ownOnly` limits it to custom lists, for the
 * management route.
 */
export class GetSpellListUsagesUseCase {
  constructor(
    private readonly reader: SpellReader,
    private readonly spellsService: SpellsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; spellListId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.readList(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Spell list not found");
    }

    return this.spellsService.getUsages(readable.access, readable.found.asset.id);
  }
}
