import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";
import type { SpellCatalogInput, SpellReader } from "#src/modules/spells/useCase/SpellReader";

/**
 * Where a spell is used in the current campaign: links and content that refers to it, such as
 * lists holding it. Players only see usages whose other end they may see as well. `ownOnly`
 * limits it to custom spells, for the management route.
 */
export class GetSpellUsagesUseCase {
  constructor(
    private readonly reader: SpellReader,
    private readonly spellsService: SpellsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(context: RequestContext, input: SpellCatalogInput): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Spell not found");
    }

    return this.spellsService.getUsages(readable.access, readable.found.asset.id);
  }
}
