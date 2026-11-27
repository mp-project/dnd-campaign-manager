import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpellDto,
  toSpellFullResponse,
  toSpellPlayerResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";
import type { SpellReader, SpellReadMode } from "#src/modules/spells/useCase/SpellReader";

export type GetSpellInput = { campaignId?: string | undefined; spellId: string };

/** The whole spell; the view depends on who reads it, see `SpellReader`. */
export class GetSpellUseCase {
  constructor(
    private readonly spellsService: SpellsService,
    private readonly reader: SpellReader,
    private readonly mode: SpellReadMode,
  ) {}

  async execute(context: RequestContext, input: GetSpellInput): Promise<ResponseSpellDto> {
    const readable = await this.reader.read(context, this.mode, input);

    if (readable.view === "FULL") {
      return toSpellFullResponse(await this.spellsService.loadRecord(this.spellsService.db, readable.found));
    }

    const { definition, isVisible } = await this.reader.definition(readable);

    return toSpellPlayerResponse(readable.found, definition, isVisible);
  }
}
