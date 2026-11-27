import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseSpellListFullDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellListContent } from "#src/modules/spells/service/SpellsService";

/** `campaignId` null creates a global spell list, which only administrators may do. */
export class CreateSpellListUseCase extends CreateContentUseCase<SpellListContent, ResponseSpellListFullDto> {
  protected readonly action = SPELL_ACTIONS.createList;
  protected readonly toResponse = toSpellListFullResponse;
}
