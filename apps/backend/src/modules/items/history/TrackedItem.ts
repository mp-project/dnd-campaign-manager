import type { AppDatabase } from "#core/db/pool";
import { ConflictError, ValidationError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import {
  ItemBaseSchema,
  ItemInstanceBaseSchema,
  ItemKnowledgeBaseSchema,
} from "#src/modules/items/domain/dto/BaseItemDto";
import {
  type ItemDefinitionParts,
  ItemDefinitionPartsSchema,
} from "#src/modules/items/domain/dto/ItemDefinitionDto";
import {
  itemInstanceKnowledge,
  itemInstances,
  items,
} from "#src/modules/items/domain/entities/ItemsTable";
import type {
  ItemInstanceRow,
  ItemKnowledgeRow,
  ItemRow,
} from "#src/modules/items/domain/repository/ItemsRepository";
import { validateItemDefinition } from "#src/modules/items/domain/ItemDefinition";

export const ITEM_ENTITY_TYPE = "item";
export const ITEM_INSTANCE_ENTITY_TYPE = "itemInstance";
export const ITEM_KNOWLEDGE_ENTITY_TYPE = "itemInstanceKnowledge";

export const ITEM_ACTIONS = {
  create: "item.create",
  update: "item.update",
  delete: "item.delete",
  restore: "item.restore",
  fork: "item.fork",
  createInstance: "itemInstance.create",
  updateInstance: "itemInstance.update",
  deleteInstance: "itemInstance.delete",
  transfer: "itemInstance.transfer",
  split: "itemInstance.split",
  merge: "itemInstance.merge",
  adjustQuantity: "itemInstance.adjustQuantity",
  equip: "itemInstance.equip",
  attune: "itemInstance.attune",
  spendCharge: "itemInstance.spendCharge",
  identify: "itemInstance.identify",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const ITEM_ASSET_ACTIONS: readonly string[] = [ITEM_ACTIONS.update, ITEM_ACTIONS.delete, ITEM_ACTIONS.restore];

/**
 * The category details depend on the category, the magic fields on `isMagical`, and effects,
 * grants and spells on attunement and charges, so they are one unit in conflict checks.
 */
export const ITEM_DEFINITION_GROUP = [
  "category",
  "isMagical",
  "weaponCategory",
  "weaponCombatType",
  "damageDiceCount",
  "damageDiceFaces",
  "damageFixed",
  "damageType",
  "versatileDiceFaces",
  "weaponProperties",
  "rangeNormal",
  "rangeLong",
  "masteryProperty",
  "armorCategory",
  "baseArmorClass",
  "dexterityMode",
  "dexterityCap",
  "strengthRequirement",
  "stealthDisadvantage",
  "toolCategory",
  "toolAbility",
  "toolUses",
  "capacityValue",
  "capacityUnit",
  "capacityWeight",
  "magicBonus",
  "magicItemType",
  "rarity",
  "attunementMode",
  "attunementPrerequisite",
  "chargesMaximum",
  "recharge",
  "sentience",
  "effects",
  "featureGrants",
  "spells",
] as const;

type TrackedDeps = {
  resolveRole(campaignId: string, actorId: string, db: AppDatabase): Promise<CampaignRole | null>;
  /** Refuses changes to content whose asset is archived; rules across rows come at the end. */
  assertChangeable(assetId: string, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts and checks the rules across fields; throws 400 with all issues. */
export function parseItemDefinition(row: ItemRow): ItemDefinitionParts {
  const parsed = ItemDefinitionPartsSchema.safeParse({
    weaponProperties: row.weaponProperties,
    effects: row.effects,
    featureGrants: row.featureGrants,
    spells: row.spells,
    recharge: row.recharge,
    sentience: row.sentience,
  });

  if (!parsed.success) {
    throw new ValidationError("Item definition is invalid", parsed.error.issues);
  }

  const issues = validateItemDefinition({ ...row, ...parsed.data });

  if (issues.length > 0) {
    throw new ValidationError("Item definition is invalid", issues);
  }

  return parsed.data;
}

/** The definition for a read; one that no longer parses is a conflict (409) until it is fixed. */
export function readItemDefinition(row: ItemRow): ItemDefinitionParts {
  try {
    return parseItemDefinition(row);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ConflictError("The stored item definition is invalid; see validate", { itemId: row.id });
    }

    throw error;
  }
}

/** The definition, or null when it no longer parses. */
export function tryParseItemDefinition(row: ItemRow): ItemDefinitionParts | null {
  try {
    return parseItemDefinition(row);
  } catch {
    return null;
  }
}

/**
 * Custom items are changed by GMs and editors, so only they read the history; global items by
 * administrators only, who pass every check anyway. Name, summary, status and rulesets are fields
 * of the asset and follow its rights.
 */
function contentAccess(deps: TrackedDeps) {
  const campaignAccess = campaignHistoryAccess<ItemRow>({
    campaignId: (row) => row.campaignId as string,
    resolveRole: deps.resolveRole,
  });

  return {
    read: async (context: Parameters<typeof campaignAccess.read>[0], row: ItemRow, db: AppDatabase) =>
      row.campaignId !== null && campaignAccess.read(context, row, db),
    readField: async (
      context: Parameters<typeof campaignAccess.read>[0],
      row: ItemRow,
      name: string,
      db: AppDatabase,
    ) => row.campaignId !== null && ((await campaignAccess.readField?.(context, row, name, db)) ?? false),
    revert: async (
      context: Parameters<typeof campaignAccess.read>[0],
      row: ItemRow,
      change: Parameters<NonNullable<typeof campaignAccess.revert>>[2],
      db: AppDatabase,
    ) => row.campaignId !== null && ((await campaignAccess.revert?.(context, row, change, db)) ?? false),
    restore: async (context: Parameters<typeof campaignAccess.read>[0], row: ItemRow, db: AppDatabase) =>
      row.campaignId !== null && ((await campaignAccess.restore?.(context, row, db)) ?? false),
  };
}

export function createTrackedItem(deps: TrackedDeps) {
  return defineTrackedEntity({
    type: ITEM_ENTITY_TYPE,
    table: items,
    baseSchema: ItemBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    groups: [ITEM_DEFINITION_GROUP, ["costAmount", "costCurrency"]],
    access: contentAccess(deps),
    fields: {
      code: field.value(),
      category: field.value(),
      // Long texts and parts, so fewer versions are kept.
      description: field.value({ history: "low" }),
      gmNotes: field.value({ history: "low" }),
      costAmount: field.value(),
      costCurrency: field.value(),
      weight: field.value(),
      isMagical: field.value(),
      isStackable: field.value(),
      consumedOnUse: field.value(),
      weaponCategory: field.value(),
      weaponCombatType: field.value(),
      damageDiceCount: field.value(),
      damageDiceFaces: field.value(),
      damageFixed: field.value(),
      damageType: field.value(),
      versatileDiceFaces: field.value(),
      weaponProperties: field.value(),
      rangeNormal: field.value(),
      rangeLong: field.value(),
      masteryProperty: field.value(),
      armorCategory: field.value(),
      baseArmorClass: field.value(),
      dexterityMode: field.value(),
      dexterityCap: field.value(),
      strengthRequirement: field.value(),
      stealthDisadvantage: field.value(),
      toolCategory: field.value(),
      toolAbility: field.value(),
      toolUses: field.value({ history: "low" }),
      capacityValue: field.value(),
      capacityUnit: field.value(),
      capacityWeight: field.value(),
      magicBonus: field.value(),
      magicItemType: field.value(),
      rarity: field.value(),
      attunementMode: field.value(),
      attunementPrerequisite: field.value(),
      chargesMaximum: field.value(),
      recharge: field.value(),
      sentience: field.value({ history: "low" }),
      effects: field.value({ history: "low" }),
      featureGrants: field.value({ history: "low" }),
      spells: field.value(),
      // Set once when the item is created or forked.
      forkedFromAssetId: field.ignore(),
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseItemDefinition(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertChangeable(next.assetId, db);
    },
  });
}

/**
 * Instances belong to the campaign and are changed by its GM and editors, who read and undo their
 * history; players have none, until the character modules let them handle their own items.
 * Quantity and charges are plain values: every command checks the version strictly.
 */
export function createTrackedItemInstance(
  deps: Pick<TrackedDeps, "resolveRole"> & {
    /**
     * The rules of an instance that need the database: attunement only where the definition
     * allows it and within the limit per actor, charges within the definition's maximum. Runs for
     * every change, undoing and restoring included.
     */
    assertInstanceState(next: ItemInstanceRow, current: ItemInstanceRow, db: AppDatabase): Promise<void>;
  },
) {
  return defineTrackedEntity({
    type: ITEM_INSTANCE_ENTITY_TYPE,
    table: itemInstances,
    baseSchema: ItemInstanceBaseSchema,
    campaignId: (row) => row.campaignId,
    access: campaignHistoryAccess<ItemInstanceRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      customName: field.value(),
      quantity: field.value(),
      ownerType: field.value(),
      ownerAssetId: field.value(),
      condition: field.value(),
      currentCharges: field.value(),
      equipped: field.value(),
      attuned: field.value(),
      notes: field.value({ history: "low" }),
      // Set once when the instance is created; the definition never changes.
      campaignId: field.ignore(),
      itemAssetId: field.ignore(),
    },
    groups: [["ownerType", "ownerAssetId", "equipped", "attuned"]],
    validate: (next) => {
      if ((next.ownerType === "UNASSIGNED") !== (next.ownerAssetId === null)) {
        throw new ValidationError("An owner type other than UNASSIGNED needs an owner, and only it");
      }

      if (next.ownerType !== "ACTOR" && (next.equipped || next.attuned)) {
        throw new ValidationError("Only actors equip items or attune to them");
      }
    },
    guard: async (next, current, db) => {
      await deps.assertInstanceState(next, current, db);
    },
  });
}

/** What players know about an instance; set by the GM and editors, like the instance. */
export function createTrackedItemKnowledge(deps: Pick<TrackedDeps, "resolveRole">) {
  return defineTrackedEntity({
    type: ITEM_KNOWLEDGE_ENTITY_TYPE,
    table: itemInstanceKnowledge,
    baseSchema: ItemKnowledgeBaseSchema,
    campaignId: (row) => row.campaignId,
    access: campaignHistoryAccess<ItemKnowledgeRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      knowledgeLevel: field.value(),
      knownName: field.value(),
      knownDescription: field.value({ history: "low" }),
      campaignId: field.ignore(),
      instanceId: field.ignore(),
      userId: field.ignore(),
    },
  });
}

export type TrackedItem = ReturnType<typeof createTrackedItem>;
export type TrackedItemInstance = ReturnType<typeof createTrackedItemInstance>;
export type TrackedItemKnowledge = ReturnType<typeof createTrackedItemKnowledge>;
