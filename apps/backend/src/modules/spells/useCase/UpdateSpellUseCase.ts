import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseUpdateSpellDto,
  toSpellFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { UpdateSpellDto } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { SpellMutation, type SpellScoped } from "#src/modules/spells/useCase/SpellMutation";

export type UpdateSpellInput = SpellScoped & { spellId: string; command: UpdateSpellDto };

export class UpdateSpellUseCase extends SpellMutation<UpdateSpellInput, ResponseUpdateSpellDto> {
  protected readonly action = SPELL_ACTIONS.update;

  protected async perform(scope: ActionScope, context: RequestContext, input: UpdateSpellInput) {
    const actorId = this.spellsService.actorIdOf(context);
    const found = await this.spellsService.requireScopedSpell(scope.tx, input);
    const { record, merged } = await this.spellsService.updateSpell(scope, {
      found,
      actorId,
      command: input.command,
    });

    return { ...toSpellFullResponse(record), merged };
  }
}
