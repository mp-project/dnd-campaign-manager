import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellListFullDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellListContent } from "#src/modules/spells/service/SpellsService";

/** Restores an archived list; checked again at the end of the action. */
export class RestoreSpellListUseCase extends RestoreContentUseCase<
  SpellListContent,
  ResponseSpellListFullDto
> {
  protected readonly action = SPELL_ACTIONS.restoreList;
  protected readonly toResponse = toSpellListFullResponse;
}
