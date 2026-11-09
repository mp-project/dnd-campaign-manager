import { campaignRoleOf } from "#core/content/viewer";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError, VersionConflictError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetRow, AssetsService, AssetType } from "#src/modules/assets/index";
import type {
  AdjustItemQuantityDto,
  AttuneItemInstanceDto,
  CreateItemInstanceDto,
  EquipItemInstanceDto,
  IdentifyItemInstanceDto,
  MergeItemInstancesDto,
  SplitItemInstanceDto,
  SpendItemChargeDto,
  TransferItemInstanceDto,
  UpdateItemInstanceDto,
} from "#src/modules/items/domain/dto/UpdateItemDto";
import type {
  ItemInstanceRow,
  ItemInstancesRepository,
  ItemKnowledgeRow,
  ItemWithAsset,
} from "#src/modules/items/domain/repository/ItemsRepository";
import {
  createTrackedItemInstance,
  createTrackedItemKnowledge,
  type TrackedItemInstance,
  type TrackedItemKnowledge,
} from "#src/modules/items/history/TrackedItem";
import type { ItemCampaignAccessPort, ItemsService } from "#src/modules/items/service/ItemsService";

/** How many items one actor can be attuned to at a time. */
export const ATTUNEMENT_LIMIT = 3;

/** Asset types an owner type accepts; `OTHER` takes any campaign asset but items. */
export const OWNER_ASSET_TYPES: Record<Exclude<ItemInstanceRow["ownerType"], "UNASSIGNED">, readonly AssetType[] | null> = {
  ACTOR: ["PLAYER_CHARACTER", "NPC", "MONSTER"],
  LOCATION: ["LOCATION"],
  QUEST: ["QUEST"],
  OTHER: null,
};

/** What a player knows of an instance; null when the player doesn't know it exists. */
export type EffectiveKnowledge = Pick<ItemKnowledgeRow, "knowledgeLevel" | "knownName" | "knownDescription"> & {
  knowledgeLevel: "SEEN" | "IDENTIFIED";
};

/** The knowledge entry of the player if there is one, otherwise the one for all players. */
export function effectiveKnowledge(rows: readonly ItemKnowledgeRow[], userId: string): EffectiveKnowledge | null {
  const own = rows.find((row) => row.userId === userId);
  const entry = own ?? rows.find((row) => row.userId === null);

  if (!entry || entry.knowledgeLevel === "UNKNOWN") {
    return null;
  }

  return {
    knowledgeLevel: entry.knowledgeLevel,
    knownName: entry.knownName,
    knownDescription: entry.knownDescription,
  };
}

/**
 * Concrete items of a campaign: how many, who has them, their state and what players know of them.
 * Every command runs in one action with a strict version check, so a repeated request can't apply
 * twice; the rules of the state (stacking, charges, attunement, owners) are checked for every
 * change, undoing and restoring included.
 */
export class ItemInstancesService {
  public readonly trackedInstance: TrackedItemInstance;
  public readonly trackedKnowledge: TrackedItemKnowledge;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: ItemInstancesRepository,
    private readonly items: ItemsService,
    private readonly assets: AssetsService,
    private readonly campaignAccess: ItemCampaignAccessPort,
  ) {
    const resolveRole = async (campaignId: string, actorId: string, tx: AppDatabase) =>
      campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx));

    this.trackedInstance = createTrackedItemInstance({
      resolveRole,
      assertInstanceState: (next, current, tx) => this.assertState(next, current, tx),
    });
    this.trackedKnowledge = createTrackedItemKnowledge({ resolveRole });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  /** An instance of the campaign; instances of other campaigns are 404. */
  async requireInstance(db: AppDatabase, path: { campaignId: string; instanceId: string }): Promise<ItemInstanceRow> {
    const found = await this.repository.findById(db, path.instanceId);

    if (!found || found.campaignId !== path.campaignId) {
      throw new NotFoundError("Item instance not found");
    }

    return found;
  }

  /** The current definition of an instance; it can't be missing while instances use it. */
  async definitionOf(db: AppDatabase, instance: Pick<ItemInstanceRow, "itemAssetId">): Promise<ItemWithAsset> {
    const found = await this.items.findByAsset(db, instance.itemAssetId);

    if (!found) {
      throw new NotFoundError("Item not found");
    }

    return found;
  }

  async knowledgeOf(db: AppDatabase, instanceIds: readonly string[]): Promise<Map<string, ItemKnowledgeRow[]>> {
    const rows = await this.repository.listKnowledge(db, instanceIds);
    const result = new Map<string, ItemKnowledgeRow[]>();

    for (const row of rows) {
      result.set(row.instanceId, [...(result.get(row.instanceId) ?? []), row]);
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /** Instances are changed by the GM, editors and administrators; players get 403, others 404. */
  async assertCanWrite(context: RequestContext, campaignId: string, db: AppDatabase): Promise<string> {
    return this.assets.assertCanWrite(context, "EDIT", campaignId, db);
  }

  /**
   * A new instance of an item the campaign may use: global and active for its ruleset, or its own
   * and not archived. Charges start full unless given.
   */
  async create(
    scope: ActionScope,
    params: { campaignId: string },
    command: CreateItemInstanceDto,
  ): Promise<ItemInstanceRow> {
    const db = scope.tx;
    const rulesetId = await this.campaignAccess.findRulesetId(params.campaignId, db);

    if (!rulesetId) {
      throw new NotFoundError("Campaign not found");
    }

    const asset = await this.assets.assertAvailable(
      { assetId: command.itemDefinitionAssetId, campaignId: params.campaignId, rulesetId },
      db,
    );

    if (asset.asset.assetType !== "ITEM") {
      throw new ConflictError("Expected an asset of type ITEM", { assetId: asset.asset.id });
    }

    const definition = await this.definitionOf(db, { itemAssetId: asset.asset.id });
    // Keeps the definition from being archived until the instance is written.
    await this.assets.lockForUse([asset.asset.id], db);

    const values = {
      campaignId: params.campaignId,
      itemAssetId: asset.asset.id,
      customName: command.customName,
      quantity: command.quantity,
      ownerType: command.ownerType,
      ownerAssetId: command.ownerAssetId,
      condition: command.state.condition,
      currentCharges:
        command.state.currentCharges !== undefined ? command.state.currentCharges : definition.item.chargesMaximum,
      equipped: false,
      attuned: false,
      notes: command.state.notes,
    };

    this.assertOwnerShape(values);
    await this.assertState(values, null, db, definition);

    return scope.create(this.trackedInstance, values);
  }

  async update(scope: ActionScope, path: InstancePath, command: UpdateItemInstanceDto): Promise<ItemInstanceRow> {
    const { expectedVersion, ...fields } = command;
    const set = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

    return this.changeStrict(scope, path, expectedVersion, () => set);
  }

  /** Soft-deletes the instance and what players knew of it. */
  async delete(scope: ActionScope, path: InstancePath, expectedVersion: number): Promise<void> {
    const current = await this.requireInstance(scope.tx, path);

    // Locks the row and checks the version under the lock, so a concurrent change isn't lost.
    await scope.change(this.trackedInstance, current.id, (locked) => {
      assertVersion(locked, expectedVersion);

      return {};
    });

    for (const knowledge of await this.repository.listKnowledge(scope.tx, [current.id])) {
      await scope.softDelete(this.trackedKnowledge, knowledge.id);
    }

    await scope.softDelete(this.trackedInstance, current.id);
  }

  /**
   * Gives pieces to another owner. The whole stack moves unless `quantity` is smaller: then a new
   * instance with that many pieces (and the same state and knowledge) goes to the new owner. What
   * moves is neither equipped nor attuned any more.
   */
  async transfer(
    scope: ActionScope,
    path: InstancePath,
    command: TransferItemInstanceDto,
  ): Promise<{ source: ItemInstanceRow; transferred: ItemInstanceRow }> {
    const owner = { ownerType: command.ownerType, ownerAssetId: command.ownerAssetId };

    this.assertOwnerShape(owner);

    const current = await this.requireInstance(scope.tx, path);

    assertVersion(current, command.expectedVersion);

    const quantity = command.quantity ?? current.quantity;

    if (quantity > current.quantity) {
      throw new ConflictError("Only the pieces of the stack can move", { quantity: current.quantity });
    }

    if (current.ownerType === owner.ownerType && current.ownerAssetId === owner.ownerAssetId) {
      throw new ConflictError("The instance already belongs to this owner");
    }

    if (quantity === current.quantity) {
      const moved = await this.changeStrict(scope, path, command.expectedVersion, () => ({
        ...owner,
        equipped: false,
        attuned: false,
      }));

      return { source: moved, transferred: moved };
    }

    return this.splitOff(scope, current, { quantity, owner, expectedVersion: command.expectedVersion });
  }

  /**
   * Takes pieces off a stack into a new instance of the same owner, with the same state and
   * knowledge (every piece of a stack is in the state of the stack). That way one piece can spend
   * charges or be attuned on its own.
   */
  async split(
    scope: ActionScope,
    path: InstancePath,
    command: SplitItemInstanceDto,
  ): Promise<{ source: ItemInstanceRow; split: ItemInstanceRow }> {
    const current = await this.requireInstance(scope.tx, path);

    if (command.quantity >= current.quantity) {
      throw new ConflictError("A split leaves at least one piece in the stack", { quantity: current.quantity });
    }

    const { source, transferred } = await this.splitOff(scope, current, {
      quantity: command.quantity,
      owner: { ownerType: current.ownerType, ownerAssetId: current.ownerAssetId },
      expectedVersion: command.expectedVersion,
    });

    return { source, split: transferred };
  }

  /**
   * Puts all pieces of this stack onto another stack and deletes this one. Only stacks of the same
   * stackable item, owner and state can be merged: condition, charges, equipment, attunement,
   * custom name, notes and what players know must be the same, so no state is lost or mixed. The
   * conflict names the fields that differ.
   */
  async merge(scope: ActionScope, path: InstancePath, command: MergeItemInstancesDto): Promise<ItemInstanceRow> {
    const db = scope.tx;

    if (command.intoInstanceId === path.instanceId) {
      throw new ConflictError("A stack can't be merged into itself");
    }

    const source = await this.requireInstance(db, path);
    const target = await this.requireInstance(db, { campaignId: path.campaignId, instanceId: command.intoInstanceId });
    const definition = await this.definitionOf(db, source);

    if (!definition.item.isStackable) {
      throw new ConflictError("Only stacks of stackable items can be merged");
    }

    const knowledge = await this.knowledgeOf(db, [source.id, target.id]);
    const differences = MERGE_STATE_FIELDS.filter((field) => source[field] !== target[field]);

    if (sameKnowledgeKey(knowledge.get(source.id) ?? []) !== sameKnowledgeKey(knowledge.get(target.id) ?? [])) {
      differences.push("knowledge" as never);
    }

    if (differences.length > 0) {
      throw new ConflictError("Only stacks of the same item, owner and state can be merged", { differences });
    }

    // Both rows locked and checked under the lock, in a fixed order so two merges can't deadlock.
    const [first, second] = [
      { id: source.id, expectedVersion: command.expectedVersion },
      { id: target.id, expectedVersion: command.expectedTargetVersion },
    ].sort((a, b) => a.id.localeCompare(b.id));

    for (const entry of [first, second]) {
      await scope.change(this.trackedInstance, entry!.id, (locked) => {
        assertVersion(locked, entry!.expectedVersion);

        return {};
      });
    }

    const { row } = await scope.change(this.trackedInstance, target.id, (locked) => ({
      set: { quantity: locked.quantity + source.quantity },
    }));

    for (const entry of knowledge.get(source.id) ?? []) {
      await scope.softDelete(this.trackedKnowledge, entry.id);
    }

    await scope.softDelete(this.trackedInstance, source.id);

    return row;
  }

  private async splitOff(
    scope: ActionScope,
    current: ItemInstanceRow,
    input: {
      quantity: number;
      owner: Pick<ItemInstanceRow, "ownerType" | "ownerAssetId">;
      expectedVersion: number;
    },
  ): Promise<{ source: ItemInstanceRow; transferred: ItemInstanceRow }> {
    const path = { campaignId: current.campaignId, instanceId: current.id };
    const source = await this.changeStrict(scope, path, input.expectedVersion, (row) => ({
      quantity: row.quantity - input.quantity,
    }));
    const values = {
      campaignId: current.campaignId,
      itemAssetId: current.itemAssetId,
      customName: current.customName,
      quantity: input.quantity,
      ...input.owner,
      condition: current.condition,
      currentCharges: current.currentCharges,
      equipped: false,
      attuned: false,
      notes: current.notes,
    };

    await this.assertState(values, null, scope.tx);

    const transferred = await scope.create(this.trackedInstance, values);

    for (const knowledge of await this.repository.listKnowledge(scope.tx, [current.id])) {
      await scope.create(this.trackedKnowledge, {
        campaignId: knowledge.campaignId,
        instanceId: transferred.id,
        userId: knowledge.userId,
        knowledgeLevel: knowledge.knowledgeLevel,
        knownName: knowledge.knownName,
        knownDescription: knowledge.knownDescription,
      });
    }

    return { source, transferred };
  }

  /** A stack never drops below one piece; only stackable items have more than one. */
  async adjustQuantity(scope: ActionScope, path: InstancePath, command: AdjustItemQuantityDto): Promise<ItemInstanceRow> {
    return this.changeStrict(scope, path, command.expectedVersion, (row) => {
      const quantity = row.quantity + command.delta;

      if (quantity < 1) {
        throw new ConflictError("A stack keeps at least one piece; delete the instance instead", {
          quantity: row.quantity,
        });
      }

      return { quantity };
    });
  }

  async equip(scope: ActionScope, path: InstancePath, command: EquipItemInstanceDto): Promise<ItemInstanceRow> {
    return this.changeStrict(scope, path, command.expectedVersion, (row) => {
      if (command.equipped && row.ownerType !== "ACTOR") {
        throw new ConflictError("Only items an actor has can be equipped");
      }

      return { equipped: command.equipped };
    });
  }

  /** Attunement needs an actor, a definition that allows it and a free place (three per actor). */
  async attune(scope: ActionScope, path: InstancePath, command: AttuneItemInstanceDto): Promise<ItemInstanceRow> {
    return this.changeStrict(scope, path, command.expectedVersion, (row) => {
      if (command.attuned && row.ownerType !== "ACTOR") {
        throw new ConflictError("Only an actor that has the item can attune to it");
      }

      return { attuned: command.attuned };
    });
  }

  /** Charges belong to one piece, so a stack of several pieces is split first. */
  async spendCharge(scope: ActionScope, path: InstancePath, command: SpendItemChargeDto): Promise<ItemInstanceRow> {
    const current = await this.requireInstance(scope.tx, path);
    const definition = await this.definitionOf(scope.tx, current);
    const maximum = definition.item.chargesMaximum;

    if (maximum === null) {
      throw new ConflictError("The item has no charges");
    }

    return this.changeStrict(scope, path, command.expectedVersion, (row) => {
      if (row.quantity > 1) {
        throw new ConflictError("Every piece of a stack has its own charges; split one piece off first", {
          quantity: row.quantity,
        });
      }

      const left = Math.min(row.currentCharges ?? maximum, maximum);

      if (left < command.amount) {
        throw new ConflictError("Not enough charges left", { currentCharges: left, amount: command.amount });
      }

      return { currentCharges: left - command.amount };
    });
  }

  /**
   * Sets what one player or all players know about the instance. Only players have knowledge
   * entries; the GM and editors always see everything. A new entry needs no version, an existing
   * one is only changed with its version (412 otherwise).
   */
  async identify(scope: ActionScope, path: InstancePath, command: IdentifyItemInstanceDto): Promise<ItemKnowledgeRow> {
    const db = scope.tx;
    const instance = await this.requireInstance(db, path);

    if (command.userId !== null) {
      const membership = await this.campaignAccess.findCampaignRole(path.campaignId, command.userId, db);

      if (!membership || (membership.role === null && !membership.isOwner)) {
        throw new NotFoundError("Player not found");
      }

      if (campaignRoleOf(membership) !== "PLAYER") {
        throw new ConflictError("Knowledge is kept for players only; the GM and editors see everything");
      }
    }

    await this.repository.lockKnowledge(db, instance.id);

    const existing = await this.repository.findKnowledge(db, { instanceId: instance.id, userId: command.userId });
    const values = {
      knowledgeLevel: command.knowledgeLevel,
      knownName: command.knownName,
      knownDescription: command.knownDescription,
    };

    if (!existing) {
      if (command.expectedVersion !== undefined) {
        throw new VersionConflictError("The knowledge entry does not exist any more", { currentVersion: null });
      }

      return scope.create(this.trackedKnowledge, {
        ...values,
        campaignId: instance.campaignId,
        instanceId: instance.id,
        userId: command.userId,
      });
    }

    if (command.expectedVersion === undefined) {
      throw new VersionConflictError("The knowledge entry exists; send its version to change it", {
        currentVersion: existing.version,
        knowledgeId: existing.id,
      });
    }

    const expectedVersion = command.expectedVersion;
    const { row } = await scope.change(this.trackedKnowledge, existing.id, (current) => {
      assertVersion(current, expectedVersion);

      return { set: values };
    });

    return row;
  }

  /**
   * Refuses archiving an item while instances use it (see `AssetArchiveGuard`); the instances would
   * otherwise refer to a definition the campaign may no longer use.
   */
  async assertCanArchive(asset: AssetRow, db: AppDatabase): Promise<void> {
    if (asset.assetType !== "ITEM") {
      return;
    }

    const count = await this.repository.countActiveOfItem(db, asset.id);

    if (count > 0) {
      throw new ConflictError("Item instances still use this item", { assetId: asset.id, instances: count });
    }
  }

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------

  /** A change with a strict version check: a repeated or outdated command is a conflict (412). */
  private async changeStrict(
    scope: ActionScope,
    path: InstancePath,
    expectedVersion: number,
    build: (current: ItemInstanceRow) => Record<string, unknown>,
  ): Promise<ItemInstanceRow> {
    await this.requireInstance(scope.tx, path);

    const { row } = await scope.change(this.trackedInstance, path.instanceId, (current) => {
      assertVersion(current, expectedVersion);

      return { set: build(current) };
    });

    return row;
  }

  private assertOwnerShape(owner: Pick<ItemInstanceRow, "ownerType" | "ownerAssetId">): void {
    if ((owner.ownerType === "UNASSIGNED") !== (owner.ownerAssetId === null)) {
      throw new ValidationError(
        owner.ownerType === "UNASSIGNED" ? "Unassigned instances have no owner" : "The owner type needs an owner",
      );
    }
  }

  /**
   * The rules of an instance's state, for a new instance (`current` null) and for every change:
   * owners are campaign assets of the fitting type and not archived, only stackable items have more
   * than one piece, charges stay within the definition's maximum, and an actor is attuned to items
   * that allow it, three at most and one copy of each item. A changed definition leaves unchanged state as it is.
   */
  private async assertState(
    next: Omit<ItemInstanceRow, "id" | "version" | "createdAt" | "updatedAt" | "deletedAt" | "createdBy" | "updatedBy"> & {
      id?: string;
      deletedAt?: Date | null;
    },
    current: ItemInstanceRow | null,
    db: AppDatabase,
    known?: ItemWithAsset,
  ): Promise<void> {
    if (next.deletedAt) {
      return;
    }

    const changed = (field: keyof ItemInstanceRow) => current === null || current[field] !== next[field as never];
    const definition = known ?? (await this.definitionOf(db, next));

    if ((changed("ownerType") || changed("ownerAssetId")) && next.ownerAssetId !== null) {
      await this.assertOwner(db, next.campaignId, next.ownerType, next.ownerAssetId);
    }

    if (changed("quantity") && next.quantity > 1 && !definition.item.isStackable) {
      throw new ConflictError("Only stackable items have more than one piece", { quantity: next.quantity });
    }

    if (changed("currentCharges") && next.currentCharges !== null) {
      if (definition.item.chargesMaximum === null) {
        throw new ConflictError("The item has no charges");
      }

      if (next.currentCharges > definition.item.chargesMaximum) {
        throw new ConflictError("Charges can't exceed the maximum of the item", {
          chargesMaximum: definition.item.chargesMaximum,
        });
      }
    }

    if (next.attuned && next.quantity > 1) {
      throw new ConflictError("Only a single piece can be attuned; split one piece off first", {
        quantity: next.quantity,
      });
    }

    if (next.attuned && (changed("attuned") || changed("ownerAssetId")) && next.ownerAssetId !== null) {
      if (definition.item.attunementMode === "NONE") {
        throw new ConflictError("The item does not allow attunement");
      }

      await this.repository.lockOwner(db, next.ownerAssetId);

      const attuned = await this.repository.countAttuned(db, {
        ownerAssetId: next.ownerAssetId,
        exceptInstanceId: next.id ?? "00000000-0000-0000-0000-000000000000",
      });

      if (attuned >= ATTUNEMENT_LIMIT) {
        throw new ConflictError(`An actor can be attuned to ${ATTUNEMENT_LIMIT} items at most`, { attuned });
      }

      // An actor can't attune to more than one copy of the same item (two Rings of Protection).
      const sameItem = await this.repository.countAttuned(db, {
        ownerAssetId: next.ownerAssetId,
        exceptInstanceId: next.id ?? "00000000-0000-0000-0000-000000000000",
        itemAssetId: next.itemAssetId,
      });

      if (sameItem > 0) {
        throw new ConflictError("An actor can be attuned to only one copy of the same item", {
          itemAssetId: next.itemAssetId,
        });
      }
    }
  }

  private async assertOwner(
    db: AppDatabase,
    campaignId: string,
    ownerType: ItemInstanceRow["ownerType"],
    ownerAssetId: string,
  ): Promise<void> {
    const owner = (await this.assets.findMany([ownerAssetId], db)).get(ownerAssetId);

    if (!owner || owner.campaignId !== campaignId) {
      throw new NotFoundError("Owner not found");
    }

    const allowed = ownerType === "UNASSIGNED" ? [] : OWNER_ASSET_TYPES[ownerType];

    if (allowed === null ? owner.assetType === "ITEM" : !allowed.includes(owner.assetType)) {
      throw new ConflictError(
        allowed === null || allowed.length === 0
          ? "Items can't own items"
          : `An owner of type ${ownerType} is a ${allowed.join(" or ")}`,
        { ownerAssetId, assetType: owner.assetType },
      );
    }

    if (owner.status === "ARCHIVED") {
      throw new ConflictError("Archived assets can't own items", { ownerAssetId });
    }
  }
}

type InstancePath = { campaignId: string; instanceId: string };

/** What two stacks must share to be merged; every piece of a stack is in the state of the stack. */
const MERGE_STATE_FIELDS = [
  "itemAssetId",
  "ownerType",
  "ownerAssetId",
  "condition",
  "currentCharges",
  "equipped",
  "attuned",
  "customName",
  "notes",
] as const satisfies readonly (keyof ItemInstanceRow)[];

/** Knowledge of a stack as a comparable value, independent of row ids and order. */
function sameKnowledgeKey(rows: readonly ItemKnowledgeRow[]): string {
  return JSON.stringify(
    rows
      .map((row) => [row.userId ?? "", row.knowledgeLevel, row.knownName, row.knownDescription])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

function assertVersion(current: { version: number }, expectedVersion: number): void {
  if (current.version !== expectedVersion) {
    throw new VersionConflictError("The item instance was changed by someone else", {
      currentVersion: current.version,
    });
  }
}
