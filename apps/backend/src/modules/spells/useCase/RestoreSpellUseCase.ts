import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellFullDto,
  toSpellFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellContent } from "#src/modules/spells/service/SpellsService";

/** Restores an archived spell; checked again at the end of the action. */
export class RestoreSpellUseCase extends RestoreContentUseCase<SpellContent, ResponseSpellFullDto> {
  protected readonly action = SPELL_ACTIONS.restore;
  protected readonly toResponse = toSpellFullResponse;
}
