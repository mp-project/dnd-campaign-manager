import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellFullDto,
  toSpellFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellContent } from "#src/modules/spells/service/SpellsService";

/** Changes the spell and its asset fields; `merged` names the fields that kept a newer value. */
export class UpdateSpellUseCase extends UpdateContentUseCase<SpellContent, ResponseSpellFullDto> {
  protected readonly action = SPELL_ACTIONS.update;
  protected readonly toResponse = toSpellFullResponse;
}
