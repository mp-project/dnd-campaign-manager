import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { CreateSpellDto, CreateSpellListDto } from "#src/modules/spells/domain/dto/CreateSpellDto";
import {
  type ResponseSpellFullDto,
  type ResponseSpellListFullDto,
  type ResponseUpdateSpellDto,
  type ResponseUpdateSpellListDto,
  type ResponseValidationDto,
  toSpellFullResponse,
  toSpellListFullResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type {
  SpellLifecycleCommandDto,
  UpdateSpellDto,
  UpdateSpellListDto,
} from "#src/modules/spells/domain/dto/UpdateSpellDto";
import { SPELL_ACTIONS } from "#src/modules/spells/history/TrackedSpell";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";

/** `campaignId` null works on global content, which only administrators may change. */
type Scoped = { campaignId: string | null };

export type CreateSpellInput = Scoped & { command: CreateSpellDto };
export type UpdateSpellInput = Scoped & { spellId: string; command: UpdateSpellDto };
export type SpellLifecycleInput = Scoped & { spellId: string; command: SpellLifecycleCommandDto };
export type CreateSpellListInput = Scoped & { command: CreateSpellListDto };
export type UpdateSpellListInput = Scoped & { spellListId: string; command: UpdateSpellListDto };
export type SpellListLifecycleInput = Scoped & { spellListId: string; command: SpellLifecycleCommandDto };

/** Every write checks the same rule: global content administrators, custom content GMs and editors. */
abstract class SpellMutation<Input extends Scoped, Output> extends MutationUseCase<Input, Output> {
  constructor(
    history: HistoryPort,
    protected readonly spellsService: SpellsService,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext, input: Input, db: AppDatabase): Promise<Authorization> {
    await this.spellsService.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }
}

export class CreateSpellUseCase extends SpellMutation<CreateSpellInput, ResponseSpellFullDto> {
  protected readonly action = SPELL_ACTIONS.create;

  protected async perform(scope: ActionScope, context: RequestContext, input: CreateSpellInput) {
    const actorId = this.spellsService.actorIdOf(context);

    return toSpellFullResponse(
      await this.spellsService.createSpell(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}

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

/** Archives the spell (`archive`) or restores it; archiving fails while lists or content need it. */
export class ChangeSpellLifecycleUseCase extends SpellMutation<SpellLifecycleInput, ResponseSpellFullDto> {
  protected readonly action: string;

  constructor(
    history: HistoryPort,
    spellsService: SpellsService,
    private readonly archive: boolean,
  ) {
    super(history, spellsService);
    this.action = archive ? SPELL_ACTIONS.delete : SPELL_ACTIONS.restore;
  }

  protected async perform(scope: ActionScope, _context: RequestContext, input: SpellLifecycleInput) {
    const found = await this.spellsService.requireScopedSpell(scope.tx, input);

    await this.spellsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: this.archive,
    });

    return toSpellFullResponse(
      await this.spellsService.loadRecord(scope.tx, await this.spellsService.requireSpell(scope.tx, found.spell.id)),
    );
  }
}

export class CreateSpellListUseCase extends SpellMutation<CreateSpellListInput, ResponseSpellListFullDto> {
  protected readonly action = SPELL_ACTIONS.createList;

  protected async perform(scope: ActionScope, context: RequestContext, input: CreateSpellListInput) {
    const actorId = this.spellsService.actorIdOf(context);

    return toSpellListFullResponse(
      await this.spellsService.createSpellList(scope, { actorId, campaignId: input.campaignId }, input.command),
    );
  }
}

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

/** Archives or restores a list; archiving fails while classes or spells refer to it. */
export class ChangeSpellListLifecycleUseCase extends SpellMutation<
  SpellListLifecycleInput,
  ResponseSpellListFullDto
> {
  protected readonly action: string;

  constructor(
    history: HistoryPort,
    spellsService: SpellsService,
    private readonly archive: boolean,
  ) {
    super(history, spellsService);
    this.action = archive ? SPELL_ACTIONS.deleteList : SPELL_ACTIONS.restoreList;
  }

  protected async perform(scope: ActionScope, _context: RequestContext, input: SpellListLifecycleInput) {
    const found = await this.spellsService.requireScopedSpellList(scope.tx, input);

    await this.spellsService.changeLifecycle(scope, {
      assetId: found.asset.id,
      expectedAssetVersion: input.command.expectedAssetVersion,
      archive: this.archive,
    });

    return toSpellListFullResponse(
      await this.spellsService.loadListRecord(
        scope.tx,
        await this.spellsService.requireSpellList(scope.tx, found.spellList.id),
      ),
    );
  }
}

/**
 * Checks a stored spell or list against the current state: schemas, rules across fields, the code
 * per ruleset and the referenced lists, spells and options. Changes nothing, so content that
 * became invalid through changes elsewhere can be found first.
 */
export class ValidateSpellContentUseCase {
  constructor(
    private readonly spellsService: SpellsService,
    private readonly kind: "spell" | "spell list",
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string | null; id: string },
  ): Promise<ResponseValidationDto> {
    const { db } = this.spellsService;

    await this.spellsService.assertCanWrite(context, input.campaignId, db);

    const found =
      this.kind === "spell"
        ? await this.spellsService.requireScopedSpell(db, { campaignId: input.campaignId, spellId: input.id })
        : await this.spellsService.requireScopedSpellList(db, {
            campaignId: input.campaignId,
            spellListId: input.id,
          });
    const issues = await this.spellsService.validateStored(db, found.asset);

    return { id: input.id, valid: issues.length === 0, issues };
  }
}
