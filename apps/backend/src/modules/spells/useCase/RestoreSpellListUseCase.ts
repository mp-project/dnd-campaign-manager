import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpellListFullDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { SpellLifecycleCommandDto } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { SpellMutation, type SpellScoped } from "#src/modules/spells/useCase/SpellMutation";

export type RestoreSpellListInput = SpellScoped & { spellListId: string; command: SpellLifecycleCommandDto };

/** Restores an archived list; checked again at the end of the action. */
export class RestoreSpellListUseCase extends SpellMutation<RestoreSpellListInput, ResponseSpellListFullDto> {
  protected readonly action = SPELL_ACTIONS.restoreList;

  protected async perform(scope: ActionScope, _context: RequestContext, input: RestoreSpellListInput) {
    const found = await this.spellsService.requireScopedSpellList(scope.tx, input);

    await this.spellsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: false,
    });

    return toSpellListFullResponse(
      await this.spellsService.loadListRecord(
        scope.tx,
        await this.spellsService.requireSpellList(scope.tx, found.spellList.id),
      ),
    );
  }
}
