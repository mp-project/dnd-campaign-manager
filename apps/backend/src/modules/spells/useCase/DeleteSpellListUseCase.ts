import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellListFullDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellListContent } from "#src/modules/spells/service/SpellsService";

/** Archives the list; it can be restored. Fails while classes or spells refer to it. */
export class DeleteSpellListUseCase extends ArchiveContentUseCase<
  SpellListContent,
  ResponseSpellListFullDto
> {
  protected readonly action = SPELL_ACTIONS.deleteList;
  protected readonly toResponse = toSpellListFullResponse;
}
