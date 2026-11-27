import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellListFullDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellListContent } from "#src/modules/spells/service/SpellsService";

/** Changes the spell list and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateSpellListUseCase extends UpdateContentUseCase<SpellListContent, ResponseSpellListFullDto> {
  protected readonly action = SPELL_ACTIONS.updateList;
  protected readonly toResponse = toSpellListFullResponse;
}
