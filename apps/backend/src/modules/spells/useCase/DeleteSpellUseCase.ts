import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellFullDto,
  toSpellFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellContent } from "#src/modules/spells/service/SpellsService";

/** Archives the spell; it can be restored. Fails while lists or content need it. */
export class DeleteSpellUseCase extends ArchiveContentUseCase<SpellContent, ResponseSpellFullDto> {
  protected readonly action = SPELL_ACTIONS.delete;
  protected readonly toResponse = toSpellFullResponse;
}
