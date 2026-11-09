import type { AppDatabase } from "#core/db/pool";
import { NotFoundError, ValidationError } from "#core/error/http/index";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import type {
  RequestItemInstancesQueryDto,
  ResolveItemInstanceDto,
} from "#src/modules/items/domain/dto/RequestItemDto";
import {
  type ResponseItemInstanceDto,
  type ResponseItemInstanceFullDto,
  type ResponseItemInstanceListDto,
  type ResponseItemKnowledgeDto,
  type ResponseItemResolutionDto,
  type ResponseItemSplitDto,
  type ResponseItemTransferDto,
  toItemInstanceFullResponse,
  toItemInstancePageResponse,
  toItemInstancePlayerResponse,
  toItemPlayerResponse,
  toKnowledgeResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type {
  AdjustItemQuantityDto,
  AttuneItemInstanceDto,
  CreateItemInstanceDto,
  DeleteItemInstanceDto,
  EquipItemInstanceDto,
  IdentifyItemInstanceDto,
  MergeItemInstancesDto,
  SplitItemInstanceDto,
  SpendItemChargeDto,
  TransferItemInstanceDto,
  UpdateItemInstanceDto,
} from "#src/modules/items/domain/dto/UpdateItemDto";
import type { ItemInstanceRow } from "#src/modules/items/domain/repository/ItemsRepository";
import { ITEM_ACTIONS, readItemDefinition, tryParseItemDefinition } from "#src/modules/items/history/TrackedItem";
import { effectiveKnowledge, type ItemInstancesService } from "#src/modules/items/service/ItemInstancesService";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

type InstancePath = { campaignId: string; instanceId: string };

/**
 * Turns instance rows into responses for one reader: the full view for the GM, editors and
 * administrators, the player view of what the player knows for players. Instances a player doesn't
 * know are missing (404 for a single one).
 */
export class ItemInstancePresenter {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {}

  async present(
    access: ContentAccess,
    rows: readonly ItemInstanceRow[],
    db: AppDatabase = this.instances.db,
  ): Promise<ResponseItemInstanceDto[]> {
    const definitions = await this.itemsService.repository.findByAssetIds(
      db,
      rows.map((row) => row.itemAssetId),
    );
    const knowledge = await this.instances.knowledgeOf(
      db,
      rows.map((row) => row.id),
    );

    if (access.isFullView) {
      return rows.flatMap((row) => {
        const definition = definitions.get(row.itemAssetId);

        return definition ? [toItemInstanceFullResponse(row, definition, knowledge.get(row.id) ?? [])] : [];
      });
    }

    const owners = [...(await this.assetsService.findMany(
      rows.flatMap((row) => (row.ownerAssetId === null ? [] : [row.ownerAssetId])),
      db,
    )).values()];
    const visibleOwners = await access.readableIds("READ", owners, db);
    const entries = rows.flatMap((row) => {
      const found = definitions.get(row.itemAssetId);
      const known = effectiveKnowledge(knowledge.get(row.id) ?? [], access.viewer.actorId);

      if (!found || !known) {
        return [];
      }

      // A definition that no longer parses shows only the appearance, until it is fixed.
      const definition = known.knowledgeLevel === "IDENTIFIED" ? tryParseItemDefinition(found.item) : null;

      return [{ row, found, known, definition }];
    });
    // One visibility lookup for the grants and spells of every identified definition on the page.
    const isVisible = await this.itemsService.playerReferenceVisibilityOf(
      entries.flatMap(({ definition }) => (definition ? [definition] : [])),
      access,
      db,
    );
    return entries.map(({ row, found, known, definition }) =>
      toItemInstancePlayerResponse(row, found, known, {
        definition: definition ? toItemPlayerResponse(found, definition, isVisible) : null,
        ownerVisible: row.ownerAssetId !== null && visibleOwners.has(row.ownerAssetId),
      }),
    );
  }

  async presentOne(access: ContentAccess, row: ItemInstanceRow, db?: AppDatabase): Promise<ResponseItemInstanceDto> {
    const [response] = await this.present(access, [row], db);

    if (!response) {
      throw new NotFoundError("Item instance not found");
    }

    return response;
  }

  async full(db: AppDatabase, row: ItemInstanceRow): Promise<ResponseItemInstanceFullDto> {
    const definition = await this.instances.definitionOf(db, row);
    const knowledge = await this.instances.knowledgeOf(db, [row.id]);

    return toItemInstanceFullResponse(row, definition, knowledge.get(row.id) ?? []);
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Filters that would let players test for what their view hides (definition, owner). */
const HIDDEN_FILTERS = ["itemAssetId", "ownerType", "ownerAssetId"] as const;

export class ListItemInstancesUseCase {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly assetsService: AssetsService,
    private readonly presenter: ItemInstancePresenter,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestItemInstancesQueryDto },
  ): Promise<ResponseItemInstanceListDto> {
    return this.list(await this.assetsService.access(context, input.campaignId), input);
  }

  /**
   * Instances for a loaded access session. Players only get instances they know of and may only
   * filter by what they see (`equipped`, `attuned`, the known name); the filters on definition and
   * owner are refused for them (400), because an empty or full answer would tell what an
   * unidentified item is or who has it.
   */
  async list(
    access: ContentAccess,
    input: { campaignId: string; query: RequestItemInstancesQueryDto },
  ): Promise<ResponseItemInstanceListDto> {
    const { query } = input;

    if (!access.isFullView && HIDDEN_FILTERS.some((filter) => query[filter] !== undefined)) {
      throw new ValidationError("Players can filter item instances by equipped, attuned and search only");
    }

    const page = await this.instances.repository.listPage(this.instances.db, {
      campaignId: input.campaignId,
      limit: query.limit,
      cursor: query.cursor,
      itemAssetId: query.itemAssetId,
      ownerType: query.ownerType,
      ownerAssetId: query.ownerAssetId,
      equipped: query.equipped,
      attuned: query.attuned,
      search: query.search,
      knownBy: access.isFullView ? undefined : access.viewer.actorId,
    });

    return toItemInstancePageResponse({
      page,
      data: await this.presenter.present(access, page.items),
      limit: query.limit,
    });
  }
}

/**
 * Instances of one item of the catalog, for the GM and editors only: for players the answer would
 * tell which item an unidentified instance is, so they get 404 like for anything they may not see.
 */
export class ListInstancesOfItemUseCase {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly listInstances: ListItemInstancesUseCase,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; itemId: string; query: RequestItemInstancesQueryDto },
  ): Promise<ResponseItemInstanceListDto> {
    const access = await this.assetsService.access(context, input.campaignId);

    if (!access.isFullView) {
      throw new NotFoundError("Item not found");
    }

    const found = await this.itemsService.requireReadableItem(access, input.itemId, "CATALOG");

    return this.listInstances.list(access, {
      campaignId: input.campaignId,
      query: { ...input.query, itemAssetId: found.asset.id },
    });
  }
}

export class GetItemInstanceUseCase {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly assetsService: AssetsService,
    private readonly presenter: ItemInstancePresenter,
  ) {}

  async execute(context: RequestContext, input: InstancePath): Promise<ResponseItemInstanceDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const row = await this.instances.requireInstance(this.instances.db, input);

    return this.presenter.presentOne(access, row);
  }
}

/**
 * What the instance gives its holder in its stored state (carried while an actor has it,
 * equipped, attuned, charges left) for the actor described in the body. Players need to have
 * identified the instance.
 */
export class ResolveItemInstanceUseCase {
  constructor(
    private readonly instances: ItemInstancesService,
    private readonly itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: InstancePath & { command: ResolveItemInstanceDto },
  ): Promise<ResponseItemResolutionDto> {
    const { db } = this.instances;
    const access = await this.assetsService.access(context, input.campaignId);
    const row = await this.instances.requireInstance(db, input);
    const found = await this.instances.definitionOf(db, row);

    if (!access.isFullView) {
      const knowledge = await this.instances.knowledgeOf(db, [row.id]);

      if (effectiveKnowledge(knowledge.get(row.id) ?? [], access.viewer.actorId)?.knowledgeLevel !== "IDENTIFIED") {
        throw new NotFoundError("Item instance not found");
      }
    }

    const definition = readItemDefinition(found.item);
    const isVisible = access.isFullView
      ? () => true
      : await this.itemsService.playerReferenceVisibility(definition, access);
    const resolved = await this.itemsService.resolve(found, {
      actor: input.command.actor,
      state: {
        carried: row.ownerType === "ACTOR",
        equipped: row.equipped,
        attuned: row.attuned,
        currentCharges: row.currentCharges,
      },
      attack: input.command.attack,
      definition,
      access,
      isVisible,
    });

    return {
      itemId: found.item.id,
      assetId: found.asset.id,
      view: access.isFullView ? "FULL" : "PLAYER",
      instanceId: row.id,
      ...resolved,
    } as ResponseItemResolutionDto;
  }
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** Every change of an instance: the GM, editors and administrators of the campaign. */
abstract class InstanceMutation<Input extends { campaignId: string }, Output> extends MutationUseCase<Input, Output> {
  constructor(
    history: HistoryPort,
    protected readonly instances: ItemInstancesService,
    protected readonly presenter: ItemInstancePresenter,
  ) {
    super(history);
  }

  protected async authorize(context: RequestContext, input: Input, db: AppDatabase): Promise<Authorization> {
    await this.instances.assertCanWrite(context, input.campaignId, db);

    return authorized();
  }
}

export class CreateItemInstanceUseCase extends InstanceMutation<
  { campaignId: string; command: CreateItemInstanceDto },
  ResponseItemInstanceFullDto
> {
  protected readonly action = ITEM_ACTIONS.createInstance;

  protected async perform(scope: ActionScope, _context: RequestContext, input: { campaignId: string; command: CreateItemInstanceDto }) {
    return this.presenter.full(scope.tx, await this.instances.create(scope, input, input.command));
  }
}

type Command<T> = InstancePath & { command: T };

/**
 * One command on an instance, answered with the full view of the instance. The commands differ
 * only in their action and the service method.
 */
export class ItemInstanceCommandUseCase<T> extends InstanceMutation<Command<T>, ResponseItemInstanceFullDto> {
  constructor(
    history: HistoryPort,
    instances: ItemInstancesService,
    presenter: ItemInstancePresenter,
    protected readonly action: string,
    private readonly run: (scope: ActionScope, path: InstancePath, command: T) => Promise<ItemInstanceRow>,
  ) {
    super(history, instances, presenter);
  }

  protected async perform(scope: ActionScope, _context: RequestContext, input: Command<T>) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.run(scope, path, command));
  }
}

export function instanceCommands(history: HistoryPort, instances: ItemInstancesService, presenter: ItemInstancePresenter) {
  const command = <T>(action: string, run: (scope: ActionScope, path: InstancePath, command: T) => Promise<ItemInstanceRow>) =>
    new ItemInstanceCommandUseCase<T>(history, instances, presenter, action, run);

  return {
    update: command<UpdateItemInstanceDto>(ITEM_ACTIONS.updateInstance, (scope, path, body) =>
      instances.update(scope, path, body),
    ),
    adjustQuantity: command<AdjustItemQuantityDto>(ITEM_ACTIONS.adjustQuantity, (scope, path, body) =>
      instances.adjustQuantity(scope, path, body),
    ),
    equip: command<EquipItemInstanceDto>(ITEM_ACTIONS.equip, (scope, path, body) => instances.equip(scope, path, body)),
    attune: command<AttuneItemInstanceDto>(ITEM_ACTIONS.attune, (scope, path, body) =>
      instances.attune(scope, path, body),
    ),
    spendCharge: command<SpendItemChargeDto>(ITEM_ACTIONS.spendCharge, (scope, path, body) =>
      instances.spendCharge(scope, path, body),
    ),
  };
}

/**
 * Not undoable in the history: a split is a smaller source plus a new instance, and undoing only the
 * source would create pieces out of nothing. A transfer is taken back by transferring again.
 */
export class TransferItemInstanceUseCase extends InstanceMutation<Command<TransferItemInstanceDto>, ResponseItemTransferDto> {
  protected readonly action = ITEM_ACTIONS.transfer;
  protected override readonly revertible = false;

  protected async perform(scope: ActionScope, _context: RequestContext, input: Command<TransferItemInstanceDto>) {
    const { command, ...path } = input;
    const { source, transferred } = await this.instances.transfer(scope, path, command);

    return {
      source: await this.presenter.full(scope.tx, source),
      transferred: await this.presenter.full(scope.tx, transferred),
    };
  }
}

/** Not undoable for the same reason as a transfer: the new stack would stay. Merge it back instead. */
export class SplitItemInstanceUseCase extends InstanceMutation<Command<SplitItemInstanceDto>, ResponseItemSplitDto> {
  protected readonly action = ITEM_ACTIONS.split;
  protected override readonly revertible = false;

  protected async perform(scope: ActionScope, _context: RequestContext, input: Command<SplitItemInstanceDto>) {
    const { command, ...path } = input;
    const { source, split } = await this.instances.split(scope, path, command);

    return {
      source: await this.presenter.full(scope.tx, source),
      split: await this.presenter.full(scope.tx, split),
    };
  }
}

/**
 * Answers with the stack the pieces went to. Not undoable: the merged stack is deleted, and undoing
 * only the bigger stack would create pieces. Split the pieces off again instead.
 */
export class MergeItemInstancesUseCase extends InstanceMutation<Command<MergeItemInstancesDto>, ResponseItemInstanceFullDto> {
  protected readonly action = ITEM_ACTIONS.merge;
  protected override readonly revertible = false;

  protected async perform(scope: ActionScope, _context: RequestContext, input: Command<MergeItemInstancesDto>) {
    const { command, ...path } = input;

    return this.presenter.full(scope.tx, await this.instances.merge(scope, path, command));
  }
}

export class IdentifyItemInstanceUseCase extends InstanceMutation<Command<IdentifyItemInstanceDto>, ResponseItemKnowledgeDto> {
  protected readonly action = ITEM_ACTIONS.identify;

  protected async perform(scope: ActionScope, _context: RequestContext, input: Command<IdentifyItemInstanceDto>) {
    const { command, ...path } = input;

    return toKnowledgeResponse(await this.instances.identify(scope, path, command));
  }
}

export class DeleteItemInstanceUseCase extends InstanceMutation<Command<DeleteItemInstanceDto>, void> {
  protected readonly action = ITEM_ACTIONS.deleteInstance;

  protected async perform(scope: ActionScope, _context: RequestContext, input: Command<DeleteItemInstanceDto>) {
    const { command, ...path } = input;

    await this.instances.delete(scope, path, command.expectedVersion);
  }
}
