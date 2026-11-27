import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpellListDetailDto,
  toSpellListFullResponse,
  toSpellListPlayerResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { storedSpellIds } from "#src/modules/spells/history/TrackedSpell";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";
import type { SpellReader, SpellReadMode } from "#src/modules/spells/useCase/SpellReader";

export type GetSpellListInput = { campaignId?: string | undefined; spellListId: string };

/** The whole list; players see only the entries they may see. */
export class GetSpellListUseCase {
  constructor(
    private readonly spellsService: SpellsService,
    private readonly reader: SpellReader,
    private readonly mode: SpellReadMode,
  ) {}

  async execute(context: RequestContext, input: GetSpellListInput): Promise<ResponseSpellListDetailDto> {
    const readable = await this.reader.readList(context, this.mode, input);

    if (readable.view === "FULL") {
      return toSpellListFullResponse(
        await this.spellsService.loadListRecord(this.spellsService.db, readable.found),
      );
    }

    const isVisible = await this.spellsService.assets.referenceVisibility(
      readable.access,
      storedSpellIds(readable.found.spellList),
    );

    return toSpellListPlayerResponse(readable.found, isVisible);
  }
}
