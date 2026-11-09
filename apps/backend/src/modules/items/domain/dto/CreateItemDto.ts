import { z } from "zod";

import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { ItemBaseSchema } from "#src/modules/items/domain/dto/BaseItemDto";
import { type ItemColumns, type ItemState, validateItemDefinition } from "#src/modules/items/domain/ItemDefinition";

const B = ItemBaseSchema.shape;

/** Asset fields of a create request; scope, campaign and origin follow from the route. */
export const assetCreateShape = {
  name: B.name,
  summary: B.summary.optional(),
  status: AssetEditableStatusSchema.default("ACTIVE"),
  releasedToPlayers: B.releasedToPlayers.default(false),
  sourceReference: B.sourceReference.optional(),
  rulesetPolicy: B.rulesetPolicy.default("NEUTRAL"),
  /** Global content only; custom content uses the ruleset of its campaign. */
  rulesetIds: B.rulesetIds.optional(),
  assetFamilyId: B.assetFamilyId.optional(),
};

/** Fields every category has. */
const commonShape = {
  ...assetCreateShape,
  code: B.code.optional(),
  description: B.description.default(null),
  gmNotes: B.gmNotes.default(null),
  costAmount: B.costAmount.default(null),
  costCurrency: B.costCurrency.default(null),
  weight: B.weight.default(null),
  isStackable: B.isStackable.default(false),
  consumedOnUse: B.consumedOnUse.default(false),
  isMagical: B.isMagical.default(false),
  magicItemType: B.magicItemType.default(null),
  rarity: B.rarity.default(null),
  attunementMode: B.attunementMode.default("NONE"),
  attunementPrerequisite: B.attunementPrerequisite.default(null),
  chargesMaximum: B.chargesMaximum.default(null),
  recharge: B.recharge.default(null),
  sentience: B.sentience.default(null),
  effects: B.effects.default([]),
  featureGrants: B.featureGrants.default([]),
  spells: B.spells.default([]),
};

const magicBonusShape = { magicBonus: B.magicBonus.default(0) };

/**
 * Create requests per category: each one takes only the fields of its category, so a weapon with
 * an armor class is refused before anything else. Weapons need a category and a combat type (and
 * damage unless they are `SPECIAL`), armor its category and armor class, magic items a rarity and
 * their attunement. The rules across fields are those of `validateItemDefinition`; references are
 * checked at the end of the action.
 */
const weaponSchema = z.strictObject({
  ...commonShape,
  ...magicBonusShape,
  category: z.literal("WEAPON"),
  weaponCategory: B.weaponCategory.unwrap(),
  weaponCombatType: B.weaponCombatType.unwrap(),
  damageDiceCount: B.damageDiceCount.default(null),
  damageDiceFaces: B.damageDiceFaces.default(null),
  damageFixed: B.damageFixed.default(null),
  damageType: B.damageType.default(null),
  versatileDiceFaces: B.versatileDiceFaces.default(null),
  weaponProperties: B.weaponProperties.default([]),
  rangeNormal: B.rangeNormal.default(null),
  rangeLong: B.rangeLong.default(null),
  masteryProperty: B.masteryProperty.default(null),
});

const armorSchema = z.strictObject({
  ...commonShape,
  ...magicBonusShape,
  category: z.literal("ARMOR"),
  armorCategory: z.enum(["LIGHT", "MEDIUM", "HEAVY"]),
  baseArmorClass: B.baseArmorClass.unwrap(),
  dexterityMode: B.dexterityMode.unwrap(),
  dexterityCap: B.dexterityCap.default(null),
  strengthRequirement: B.strengthRequirement.default(null),
  stealthDisadvantage: B.stealthDisadvantage.default(false),
});

const shieldSchema = z.strictObject({
  ...commonShape,
  ...magicBonusShape,
  category: z.literal("SHIELD"),
  armorCategory: z.literal("SHIELD").default("SHIELD"),
  /** The bonus the shield adds to the armor class. */
  baseArmorClass: B.baseArmorClass.unwrap().default(2),
  dexterityMode: z.literal("NONE").default("NONE"),
});

const toolSchema = z.strictObject({
  ...commonShape,
  category: z.literal("TOOL"),
  toolCategory: B.toolCategory.unwrap(),
  toolAbility: B.toolAbility.default(null),
  toolUses: B.toolUses.default(null),
});

const containerSchema = z.strictObject({
  ...commonShape,
  category: z.literal("CONTAINER"),
  capacityValue: B.capacityValue.default(null),
  capacityUnit: B.capacityUnit.default(null),
  capacityWeight: B.capacityWeight.default(null),
});

const magicItemSchema = z.strictObject({
  ...commonShape,
  category: z.literal("MAGIC_ITEM"),
  isMagical: z.literal(true).default(true),
  magicItemType: B.magicItemType.unwrap(),
  rarity: B.rarity.unwrap(),
  attunementMode: B.attunementMode,
});

const plainSchemas = (["ADVENTURING_GEAR", "CONSUMABLE", "MOUNT", "VEHICLE", "TREASURE", "CUSTOM"] as const).map(
  (category) => z.strictObject({ ...commonShape, category: z.literal(category) }),
);

/** Every typed column with null for those the category leaves out. */
const EMPTY_COLUMNS: Omit<ItemColumns, CommonColumn> & { weaponProperties: never[] } = {
  weaponCategory: null,
  weaponCombatType: null,
  damageDiceCount: null,
  damageDiceFaces: null,
  damageFixed: null,
  damageType: null,
  versatileDiceFaces: null,
  weaponProperties: [],
  rangeNormal: null,
  rangeLong: null,
  masteryProperty: null,
  armorCategory: null,
  baseArmorClass: null,
  dexterityMode: null,
  dexterityCap: null,
  strengthRequirement: null,
  stealthDisadvantage: false,
  toolCategory: null,
  toolAbility: null,
  toolUses: null,
  capacityValue: null,
  capacityUnit: null,
  capacityWeight: null,
  magicBonus: 0,
};

type CommonColumn =
  | "category"
  | "costAmount"
  | "costCurrency"
  | "isMagical"
  | "magicItemType"
  | "rarity"
  | "attunementMode"
  | "attunementPrerequisite"
  | "chargesMaximum";

/** The columns of a create request, with the ones its category leaves out empty. */
export function columnsOfCreate(command: CreateItemDto) {
  return { ...EMPTY_COLUMNS, ...command } as typeof EMPTY_COLUMNS & CreateItemDto & ItemState;
}

export const CreateItemSchema = z
  .discriminatedUnion("category", [
    weaponSchema,
    armorSchema,
    shieldSchema,
    toolSchema,
    containerSchema,
    magicItemSchema,
    ...plainSchemas,
  ])
  .superRefine((value, ctx) => {
    for (const issue of validateItemDefinition(columnsOfCreate(value))) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
  });

export type CreateItemDto = z.infer<typeof CreateItemSchema>;

/**
 * A custom copy of an item the campaign may use, with all its details, effects, grants and spells.
 * Name and code default to those of the source.
 */
export const ForkItemSchema = z.strictObject({
  name: B.name.optional(),
  code: B.code.optional(),
  status: AssetEditableStatusSchema.default("DRAFT"),
});

export type ForkItemDto = z.infer<typeof ForkItemSchema>;
