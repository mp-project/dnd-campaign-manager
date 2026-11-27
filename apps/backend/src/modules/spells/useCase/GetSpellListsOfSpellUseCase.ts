import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseSpellListsOfSpellDto } from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { storedSpellIds, storedSpellListIds } from "#src/modules/spells/history/TrackedSpell";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";
import {
  readableSpellHeader,
  type SpellCatalogInput,
  type SpellReader,
} from "#src/modules/spells/useCase/SpellReader";

/** The lists the spell belongs to in the campaign, as far as the reader may see them. */
export class GetSpellListsOfSpellUseCase {
  constructor(
    private readonly reader: SpellReader,
    private readonly spellsService: SpellsService,
  ) {}

  async execute(context: RequestContext, input: SpellCatalogInput): Promise<ResponseSpellListsOfSpellDto> {
    const readable = await this.reader.read(context, "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Spell not found");
    }

    const named = new Set(storedSpellListIds(readable.found.spell));
    const lists = await this.spellsService.listsOfSpell(readable.access, readable.found);

    return {
      ...readableSpellHeader(readable),
      lists: lists.map(({ spellList, asset }) => {
        const entry = storedSpellIds(spellList).includes(readable.found.asset.id);
        const byName = named.has(asset.id);

        return {
          id: spellList.id,
          assetId: asset.id,
          scope: asset.scope,
          code: spellList.code,
          name: asset.title,
          membership: entry && byName ? "BOTH" : entry ? "ENTRY" : "NAMED_BY_SPELL",
        };
      }),
    };
  }
}
