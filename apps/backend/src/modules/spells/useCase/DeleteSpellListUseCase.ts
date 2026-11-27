import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import {
  type ResponseSpellListFullDto,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type { SpellLifecycleCommandDto } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import { SpellMutation, type SpellScoped } from "#src/modules/spells/useCase/SpellMutation";

export type DeleteSpellListInput = SpellScoped & { spellListId: string; command: SpellLifecycleCommandDto };

/** Archives the list; it can be restored. Fails while classes or spells refer to it. */
export class DeleteSpellListUseCase extends SpellMutation<DeleteSpellListInput, ResponseSpellListFullDto> {
  protected readonly action = SPELL_ACTIONS.deleteList;

  protected async perform(scope: ActionScope, _context: RequestContext, input: DeleteSpellListInput) {
    const found = await this.spellsService.requireScopedSpellList(scope.tx, input);

    await this.spellsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: true,
    });

    return toSpellListFullResponse(
      await this.spellsService.loadListRecord(
        scope.tx,
        await this.spellsService.requireSpellList(scope.tx, found.spellList.id),
      ),
    );
  }
}
