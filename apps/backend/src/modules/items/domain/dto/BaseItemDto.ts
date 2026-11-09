import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import {
  dieFacesDto,
  ItemDefinitionPartsSchema,
} from "#src/modules/items/domain/dto/ItemDefinitionDto";
import {
  ARMOR_CATEGORIES,
  ATTUNEMENT_MODES,
  CAPACITY_UNITS,
  DAMAGE_TYPES,
  DEXTERITY_MODES,
  ITEM_ABILITIES,
  ITEM_CATEGORIES,
  ITEM_CONDITIONS,
  ITEM_CURRENCIES,
  ITEM_KNOWLEDGE_LEVELS,
  ITEM_MAX_CHARGES,
  ITEM_MAX_MAGIC_BONUS,
  ITEM_MAX_QUANTITY,
  ITEM_MIN_MAGIC_BONUS,
  ITEM_NAME_MAX_LENGTH,
  ITEM_OWNER_TYPES,
  ITEM_RARITIES,
  ITEM_TEXT_MAX_LENGTH,
  MAGIC_ITEM_TYPES,
  TOOL_CATEGORIES,
  WEAPON_CATEGORIES,
  WEAPON_COMBAT_TYPES,
  WEAPON_MASTERIES,
} from "#src/modules/items/domain/entities/ItemsTable";

export const itemCodeDto = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Markdown; only the rendered `…Html` fields of a response are HTML. */
export const itemTextDto = z.string().trim().min(1).max(ITEM_TEXT_MAX_LENGTH);
const amountDto = z.number().min(0).max(100_000).multipleOf(0.01);

/** Fields of the asset that items show as their own (`name` is its title). */
const assetShape = {
  id: uuidDto,
  assetId: uuidDto,
  campaignId: uuidDto.nullable(),
  scope: AssetBaseSchema.shape.scope,
  name: z.string().trim().min(1).max(160),
  summary: AssetBaseSchema.shape.summary,
  status: AssetBaseSchema.shape.status,
  sourceReference: AssetBaseSchema.shape.sourceReference,
  rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy,
  rulesetIds: AssetBaseSchema.shape.rulesetIds,
  assetFamilyId: AssetBaseSchema.shape.assetFamilyId,
  /** Custom content only: players of the campaign may see and use it. */
  releasedToPlayers: AssetBaseSchema.shape.releasedToPlayers,
};

/** Weapon columns; set on weapons only. */
export const weaponShape = {
  weaponCategory: z.enum(WEAPON_CATEGORIES).nullable(),
  weaponCombatType: z.enum(WEAPON_COMBAT_TYPES).nullable(),
  damageDiceCount: z.number().int().min(1).max(20).nullable(),
  damageDiceFaces: dieFacesDto.nullable(),
  damageFixed: z.number().int().min(1).max(100).nullable(),
  damageType: z.enum(DAMAGE_TYPES).nullable(),
  versatileDiceFaces: dieFacesDto.nullable(),
  weaponProperties: ItemDefinitionPartsSchema.shape.weaponProperties,
  rangeNormal: z.number().int().min(1).max(10_000).nullable(),
  rangeLong: z.number().int().min(1).max(10_000).nullable(),
  masteryProperty: z.enum(WEAPON_MASTERIES).nullable(),
};

/** Armor and shield columns. */
export const armorShape = {
  armorCategory: z.enum(ARMOR_CATEGORIES).nullable(),
  baseArmorClass: z.number().int().min(0).max(30).nullable(),
  dexterityMode: z.enum(DEXTERITY_MODES).nullable(),
  dexterityCap: z.number().int().min(0).max(10).nullable(),
  strengthRequirement: z.number().int().min(1).max(30).nullable(),
  stealthDisadvantage: z.boolean(),
};

export const toolShape = {
  toolCategory: z.enum(TOOL_CATEGORIES).nullable(),
  toolAbility: z.enum(ITEM_ABILITIES).nullable(),
  toolUses: itemTextDto.nullable(),
};

export const containerShape = {
  capacityValue: amountDto.positive().nullable(),
  capacityUnit: z.enum(CAPACITY_UNITS).nullable(),
  capacityWeight: amountDto.positive().nullable(),
};

export const magicShape = {
  magicBonus: z.number().int().min(ITEM_MIN_MAGIC_BONUS).max(ITEM_MAX_MAGIC_BONUS),
  magicItemType: z.enum(MAGIC_ITEM_TYPES).nullable(),
  rarity: z.enum(ITEM_RARITIES).nullable(),
  attunementMode: z.enum(ATTUNEMENT_MODES),
  attunementPrerequisite: z.string().trim().min(1).max(500).nullable(),
  chargesMaximum: z.number().int().min(1).max(ITEM_MAX_CHARGES).nullable(),
  recharge: ItemDefinitionPartsSchema.shape.recharge,
  sentience: ItemDefinitionPartsSchema.shape.sentience,
};

/**
 * All item fields with their validation rules, including the asset fields an item shows as its
 * own. Request and response DTOs derive from this schema. The details of each category are flat
 * fields, one per column, so the history and `merged` name them one by one.
 */
export const ItemBaseSchema = z.strictObject({
  ...assetShape,
  code: itemCodeDto,
  category: z.enum(ITEM_CATEGORIES),
  description: itemTextDto.nullable(),
  gmNotes: itemTextDto.nullable(),
  costAmount: z.number().int().min(0).max(100_000_000).nullable(),
  costCurrency: z.enum(ITEM_CURRENCIES).nullable(),
  weight: amountDto.nullable(),
  isMagical: z.boolean(),
  isStackable: z.boolean(),
  consumedOnUse: z.boolean(),
  ...weaponShape,
  ...armorShape,
  ...toolShape,
  ...containerShape,
  ...magicShape,
  effects: ItemDefinitionPartsSchema.shape.effects,
  featureGrants: ItemDefinitionPartsSchema.shape.featureGrants,
  spells: ItemDefinitionPartsSchema.shape.spells,
  forkedFromAssetId: uuidDto.nullable(),
});

export type ItemBaseDto = z.infer<typeof ItemBaseSchema>;

// ---------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------

export const itemNameDto = z.string().trim().min(1).max(ITEM_NAME_MAX_LENGTH);

/** All instance fields; the state is part of the instance row. */
export const ItemInstanceBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  itemAssetId: uuidDto,
  customName: itemNameDto.nullable(),
  quantity: z.number().int().min(1).max(ITEM_MAX_QUANTITY),
  ownerType: z.enum(ITEM_OWNER_TYPES),
  ownerAssetId: uuidDto.nullable(),
  condition: z.enum(ITEM_CONDITIONS),
  currentCharges: z.number().int().min(0).max(ITEM_MAX_CHARGES).nullable(),
  equipped: z.boolean(),
  attuned: z.boolean(),
  notes: itemTextDto.nullable(),
});

export type ItemInstanceBaseDto = z.infer<typeof ItemInstanceBaseSchema>;

export const ItemKnowledgeBaseSchema = z.strictObject({
  id: uuidDto,
  campaignId: uuidDto,
  instanceId: uuidDto,
  /** Null: every player of the campaign. */
  userId: uuidDto.nullable(),
  knowledgeLevel: z.enum(ITEM_KNOWLEDGE_LEVELS),
  knownName: itemNameDto.nullable(),
  knownDescription: itemTextDto.nullable(),
});

export type ItemKnowledgeBaseDto = z.infer<typeof ItemKnowledgeBaseSchema>;
