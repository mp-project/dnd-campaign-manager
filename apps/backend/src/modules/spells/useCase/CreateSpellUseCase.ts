import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellFullDto,
  toSpellFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellContent } from "#src/modules/spells/service/SpellsService";

/** `campaignId` null creates a global spell, which only administrators may do. */
export class CreateSpellUseCase extends CreateContentUseCase<SpellContent, ResponseSpellFullDto> {
  protected readonly action = SPELL_ACTIONS.create;
  protected readonly toResponse = toSpellFullResponse;
}
