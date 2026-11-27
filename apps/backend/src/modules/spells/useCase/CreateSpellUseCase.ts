import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateSpellDto } from "#src/modules/spells/domain/dto/CreateSpellDto";
import {
  type ResponseSpellFullDto,
  toSpellFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { SpellMutation, type SpellScoped } from "#src/modules/spells/useCase/SpellMutation";

export type CreateSpellInput = SpellScoped & { command: CreateSpellDto };

export class CreateSpellUseCase extends SpellMutation<CreateSpellInput, ResponseSpellFullDto> {
  protected readonly action = SPELL_ACTIONS.create;

  protected async perform(scope: ActionScope, context: RequestContext, input: CreateSpellInput) {
    const actorId = this.spellsService.actorIdOf(context);

    return toSpellFullResponse(
      await this.spellsService.createSpell(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}
