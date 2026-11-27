import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpellFullDto,
  toSpellFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { SpellLifecycleCommandDto } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { SpellMutation, type SpellScoped } from "#src/modules/spells/useCase/SpellMutation";

export type RestoreSpellInput = SpellScoped & { spellId: string; command: SpellLifecycleCommandDto };

/** Restores an archived spell; checked again at the end of the action. */
export class RestoreSpellUseCase extends SpellMutation<RestoreSpellInput, ResponseSpellFullDto> {
  protected readonly action = SPELL_ACTIONS.restore;

  protected async perform(scope: ActionScope, _context: RequestContext, input: RestoreSpellInput) {
    const found = await this.spellsService.requireScopedSpell(scope.tx, input);

    await this.spellsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: false,
    });

    return toSpellFullResponse(
      await this.spellsService.loadRecord(scope.tx, await this.spellsService.requireSpell(scope.tx, found.spell.id)),
    );
  }
}
