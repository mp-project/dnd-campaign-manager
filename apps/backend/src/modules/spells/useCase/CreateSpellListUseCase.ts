import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateSpellListDto } from "#src/modules/spells/domain/dto/CreateSpellDto";
import {
  type ResponseSpellListFullDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { SpellMutation, type SpellScoped } from "#src/modules/spells/useCase/SpellMutation";

export type CreateSpellListInput = SpellScoped & { command: CreateSpellListDto };

export class CreateSpellListUseCase extends SpellMutation<CreateSpellListInput, ResponseSpellListFullDto> {
  protected readonly action = SPELL_ACTIONS.createList;

  protected async perform(scope: ActionScope, context: RequestContext, input: CreateSpellListInput) {
    const actorId = this.spellsService.actorIdOf(context);

    return toSpellListFullResponse(
      await this.spellsService.createSpellList(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}
