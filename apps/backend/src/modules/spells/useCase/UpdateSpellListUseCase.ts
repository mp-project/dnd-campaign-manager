import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateSpellListDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { UpdateSpellListDto } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { SpellMutation, type SpellScoped } from "#src/modules/spells/useCase/SpellMutation";

export type UpdateSpellListInput = SpellScoped & { spellListId: string; command: UpdateSpellListDto };

export class UpdateSpellListUseCase extends SpellMutation<UpdateSpellListInput, ResponseUpdateSpellListDto> {
  protected readonly action = SPELL_ACTIONS.updateList;

  protected async perform(scope: ActionScope, context: RequestContext, input: UpdateSpellListInput) {
    const actorId = this.spellsService.actorIdOf(context);
    const found = await this.spellsService.requireScopedSpellList(scope.tx, input);
    const { record, merged } = await this.spellsService.updateSpellList(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toSpellListFullResponse(record), merged };
  }
}
