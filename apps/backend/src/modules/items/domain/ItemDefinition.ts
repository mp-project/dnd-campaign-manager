import {
  listPayloadDiceRefs,
  listPayloadExpressions,
  type PredicateExpression,
  type ValueExpression,
} from "#core/rules/contracts";
import { assertExpressionLimits, collectVariableKeys } from "#core/rules/evaluator";
import type { AssetReference } from "#src/modules/assets/index";
import { ABILITIES } from "#src/modules/features/index";
import type {
  ItemDefinitionParts,
  ItemEffect,
  ItemFeatureGrant,
  ItemSpell,
} from "#src/modules/items/domain/dto/ItemDefinitionDto";

export type DefinitionIssue = { path: (string | number)[]; message: string };

/** The typed columns of an item the rules look at, besides the jsonb parts. */
export type ItemColumns = {
  category: string;
  costAmount: number | null;
  costCurrency: string | null;
  isMagical: boolean;
  weaponCategory: string | null;
  weaponCombatType: string | null;
  damageDiceCount: number | null;
  damageDiceFaces: number | null;
  damageFixed: number | null;
  damageType: string | null;
  versatileDiceFaces: number | null;
  rangeNormal: number | null;
  rangeLong: number | null;
  masteryProperty: string | null;
  armorCategory: string | null;
  baseArmorClass: number | null;
  dexterityMode: string | null;
  dexterityCap: number | null;
  strengthRequirement: number | null;
  stealthDisadvantage: boolean;
  toolCategory: string | null;
  toolAbility: string | null;
  toolUses: string | null;
  capacityValue: number | null;
  capacityUnit: string | null;
  capacityWeight: number | null;
  magicBonus: number;
  magicItemType: string | null;
  rarity: string | null;
  attunementMode: string;
  attunementPrerequisite: string | null;
  chargesMaximum: number | null;
};

export type ItemState = ItemColumns & ItemDefinitionParts;

/** Columns of each category; every other category keeps them empty. */
const WEAPON_FIELDS = [
  "weaponCategory",
  "weaponCombatType",
  "damageDiceCount",
  "damageDiceFaces",
  "damageFixed",
  "damageType",
  "versatileDiceFaces",
  "rangeNormal",
  "rangeLong",
  "masteryProperty",
] as const;
const ARMOR_FIELDS = ["armorCategory", "baseArmorClass", "dexterityMode", "dexterityCap", "strengthRequirement"] as const;
const TOOL_FIELDS = ["toolCategory", "toolAbility", "toolUses"] as const;
const CONTAINER_FIELDS = ["capacityValue", "capacityUnit", "capacityWeight"] as const;
const ARMORED_CATEGORIES = new Set(["ARMOR", "SHIELD"]);
const MAGIC_BONUS_CATEGORIES = new Set(["WEAPON", "ARMOR", "SHIELD"]);

/**
 * Values a resolution may provide: the actor's level, proficiency bonus and abilities, the item's
 * magic bonus and, for items with charges, the charges. Missing ones make results unknown.
 */
export const ITEM_CONTEXT_VALUE_KEYS: readonly string[] = [
  "level.character",
  "proficiencyBonus",
  ...ABILITIES.flatMap((ability) => [`ability.${ability}`, `ability.${ability}.modifier`]),
  "item.magicBonus",
];

export const CHARGE_VALUE_KEYS: readonly string[] = ["charges.current", "charges.maximum"];

/** Actor values a context binding of a granted feature may read. */
export const ITEM_BINDING_CONTEXT_KEYS: readonly string[] = [
  "level.character",
  "proficiencyBonus",
  ...ABILITIES.flatMap((ability) => [`ability.${ability}`, `ability.${ability}.modifier`]),
];

export function buildItemVocabulary(item: Pick<ItemColumns, "chargesMaximum">): Set<string> {
  return new Set([...ITEM_CONTEXT_VALUE_KEYS, ...(item.chargesMaximum !== null ? CHARGE_VALUE_KEYS : [])]);
}

function duplicates(keys: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const key of keys) {
    if (seen.has(key)) {
      repeated.add(key);
    }

    seen.add(key);
  }

  return repeated;
}

function checkExpression(
  expression: { kind: "value"; root: ValueExpression } | { kind: "predicate"; root: PredicateExpression },
  allowed: ReadonlySet<string>,
  path: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  try {
    assertExpressionLimits(expression);
  } catch (error) {
    add(path, error instanceof Error ? error.message : "The expression is too large");
    return;
  }

  for (const key of collectVariableKeys(expression)) {
    if (!allowed.has(key)) {
      add(
        path,
        CHARGE_VALUE_KEYS.includes(key) ? `'${key}' needs an item with charges` : `Unknown variable '${key}'`,
      );
    }
  }
}

function checkWeapon(item: ItemState, add: (path: (string | number)[], message: string) => void): void {
  const properties = new Set(item.weaponProperties);
  const hasDice = item.damageDiceCount !== null || item.damageDiceFaces !== null;
  const ranged = item.weaponCombatType === "RANGED";

  if (item.weaponCategory === null) {
    add(["weaponCategory"], "Weapons need a category");
  }

  if (item.weaponCombatType === null) {
    add(["weaponCombatType"], "Weapons are melee or ranged");
  }

  if ((item.damageDiceCount === null) !== (item.damageDiceFaces === null)) {
    add(["damageDiceFaces"], "Damage dice need a count and faces");
  }

  if (hasDice && item.damageFixed !== null) {
    add(["damageFixed"], "Damage is dice or a fixed value, not both");
  }

  if ((item.damageType !== null) !== (hasDice || item.damageFixed !== null)) {
    add(["damageType"], "Damage, and only damage, needs a damage type");
  }

  if (!hasDice && item.damageFixed === null && !properties.has("SPECIAL")) {
    add(["damageDiceCount"], "Weapons without damage need the property SPECIAL");
  }

  if (properties.has("VERSATILE") !== (item.versatileDiceFaces !== null)) {
    add(["versatileDiceFaces"], "Versatile weapons, and only they, have a two-handed die");
  }

  if (item.versatileDiceFaces !== null && item.damageDiceCount === null) {
    add(["versatileDiceFaces"], "A two-handed die needs damage dice");
  }

  if ((ranged || properties.has("THROWN")) !== (item.rangeNormal !== null)) {
    add(["rangeNormal"], "Ranged and thrown weapons, and only they, have a range");
  }

  if ((item.rangeNormal === null) !== (item.rangeLong === null)) {
    add(["rangeLong"], "A range needs a normal and a long distance");
  } else if (item.rangeNormal !== null && item.rangeLong !== null && item.rangeLong < item.rangeNormal) {
    add(["rangeLong"], "The long range can't be shorter than the normal range");
  }

  const requires: [string, boolean, string][] = [
    ["AMMUNITION", ranged, "Only ranged weapons use ammunition"],
    ["LOADING", ranged, "Only ranged weapons need loading"],
    ["REACH", !ranged, "Only melee weapons have reach"],
    ["LIGHT", !properties.has("HEAVY"), "A weapon can't be light and heavy"],
    ["TWO_HANDED", !properties.has("VERSATILE"), "A weapon can't be two-handed and versatile"],
  ];

  for (const [property, allowed, message] of requires) {
    if (properties.has(property as never) && !allowed) {
      add(["weaponProperties"], message);
    }
  }
}

function checkArmor(item: ItemState, add: (path: (string | number)[], message: string) => void): void {
  const shield = item.category === "SHIELD";

  if (item.armorCategory === null) {
    add(["armorCategory"], "Armor and shields need an armor category");
  } else if ((item.armorCategory === "SHIELD") !== shield) {
    add(["armorCategory"], "Shields, and only shields, have the armor category SHIELD");
  }

  if (item.baseArmorClass === null) {
    add(["baseArmorClass"], shield ? "Shields need the bonus they add" : "Armor needs a base armor class");
  }

  if (item.dexterityMode === null) {
    add(["dexterityMode"], "Armor and shields say how much Dexterity they add");
  }

  if ((item.dexterityMode === "CAPPED") !== (item.dexterityCap !== null)) {
    add(["dexterityCap"], "A capped Dexterity bonus, and only it, needs a cap");
  }

  if (shield && (item.dexterityMode !== "NONE" || item.strengthRequirement !== null || item.stealthDisadvantage)) {
    add(["dexterityMode"], "Shields add a flat bonus: no Dexterity, Strength requirement or stealth disadvantage");
  }
}

function checkEmpty(
  item: ItemState,
  fields: readonly (keyof ItemColumns)[],
  category: string,
  add: (path: (string | number)[], message: string) => void,
): void {
  for (const field of fields) {
    if (item[field] !== null) {
      add([field], `Only ${category} have '${field}'`);
    }
  }
}

function checkActivation(
  activation: string,
  item: ItemState,
  path: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  if (activation === "ATTUNED" && item.attunementMode === "NONE") {
    add([...path, "activation"], "Only items that allow attunement can work while attuned");
  }
}

function checkChargeCost(
  chargeCost: number,
  item: ItemState,
  path: (string | number)[],
  add: (path: (string | number)[], message: string) => void,
): void {
  if (chargeCost > 0 && item.chargesMaximum === null) {
    add([...path, "chargeCost"], "Only items with charges can spend them");
  } else if (item.chargesMaximum !== null && chargeCost > item.chargesMaximum) {
    add([...path, "chargeCost"], "A use can't cost more charges than the item holds");
  }
}

/**
 * Rules across the columns and parts of an item that need no database: the columns of a category
 * only on items of that category, the weapon properties that need a range, a two-handed die or a
 * combat type, armor with its Dexterity rule, magic columns only on magic items, unique keys,
 * attunement and charges of effects, grants and spells, and expressions within their limits with
 * known variables. Asset references (granted features, spells) are checked by the service.
 */
export function validateItemDefinition(item: ItemState): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });

  if ((item.costAmount === null) !== (item.costCurrency === null)) {
    add(["costCurrency"], "A cost needs an amount and a currency");
  }

  if (item.category === "WEAPON") {
    checkWeapon(item, add);
  } else {
    checkEmpty(item, WEAPON_FIELDS, "weapons", add);

    if (item.weaponProperties.length > 0) {
      add(["weaponProperties"], "Only weapons have weapon properties");
    }
  }

  if (ARMORED_CATEGORIES.has(item.category)) {
    checkArmor(item, add);
  } else {
    checkEmpty(item, ARMOR_FIELDS, "armor and shields", add);

    if (item.stealthDisadvantage) {
      add(["stealthDisadvantage"], "Only armor imposes disadvantage on stealth");
    }
  }

  if (item.category === "TOOL") {
    if (item.toolCategory === null) {
      add(["toolCategory"], "Tools need a tool category");
    }
  } else {
    checkEmpty(item, TOOL_FIELDS, "tools", add);
  }

  if (item.category === "CONTAINER") {
    if ((item.capacityValue === null) !== (item.capacityUnit === null)) {
      add(["capacityUnit"], "A capacity needs a value and a unit");
    }
  } else {
    checkEmpty(item, CONTAINER_FIELDS, "containers", add);
  }

  if (item.category === "MAGIC_ITEM" && !item.isMagical) {
    add(["isMagical"], "Magic items are magical");
  }

  if (item.isMagical) {
    if (item.rarity === null) {
      add(["rarity"], "Magic items need a rarity");
    }

    if (item.magicItemType === null) {
      add(["magicItemType"], "Magic items need a magic item type");
    }
  } else {
    checkEmpty(item, ["rarity", "magicItemType", "chargesMaximum", "attunementPrerequisite"], "magic items", add);

    if (item.magicBonus !== 0) {
      add(["magicBonus"], "Only magic items have a magic bonus");
    }

    if (item.attunementMode !== "NONE") {
      add(["attunementMode"], "Only magic items require attunement");
    }

    if (item.sentience !== null) {
      add(["sentience"], "Only magic items can be sentient");
    }
  }

  if (item.magicBonus !== 0 && !MAGIC_BONUS_CATEGORIES.has(item.category)) {
    add(["magicBonus"], "Only weapons, armor and shields have a magic bonus");
  }

  if (item.attunementPrerequisite !== null && item.attunementMode === "NONE") {
    add(["attunementPrerequisite"], "Only items that allow attunement have a prerequisite for it");
  }

  if (item.recharge !== null && item.chargesMaximum === null) {
    add(["recharge"], "Only items with charges recharge");
  }

  const parts: [keyof ItemDefinitionParts, readonly { key: string }[]][] = [
    ["effects", item.effects],
    ["featureGrants", item.featureGrants],
    ["spells", item.spells],
  ];

  for (const [name, entries] of parts) {
    for (const key of duplicates(entries.map((entry) => entry.key))) {
      add([name], `Key '${key}' is used more than once`);
    }
  }

  const vocabulary = buildItemVocabulary(item);

  item.effects.forEach((effect: ItemEffect, index) => {
    const path = ["effects", index];

    checkActivation(effect.activation, item, path, add);
    checkChargeCost(effect.chargeCost, item, path, add);

    if (effect.condition) {
      checkExpression({ kind: "predicate", root: effect.condition }, vocabulary, [...path, "condition"], add);
    }

    for (const expression of listPayloadExpressions(effect.payload)) {
      checkExpression({ kind: "value", root: expression }, vocabulary, [...path, "payload"], add);
    }

    for (const ref of listPayloadDiceRefs(effect.payload)) {
      add([...path, "payload", "dice"], `Unknown dice '${ref}'; items roll fixed dice`);
    }
  });

  item.featureGrants.forEach((grant: ItemFeatureGrant, index) => {
    const path = ["featureGrants", index];

    checkActivation(grant.activation, item, path, add);
    grant.bindings.forEach((binding, bindingIndex) => {
      if (binding.contextKey !== null && !ITEM_BINDING_CONTEXT_KEYS.includes(binding.contextKey)) {
        add([...path, "bindings", bindingIndex, "contextKey"], `Unknown context value '${binding.contextKey}'`);
      }
    });
  });

  item.spells.forEach((spell: ItemSpell, index) => {
    const path = ["spells", index];

    checkActivation(spell.activation, item, path, add);
    checkChargeCost(spell.chargeCost, item, path, add);
  });

  return issues;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

/** Granted and targeted features. */
export function collectGrantReferences(grants: readonly ItemFeatureGrant[]): AssetReference[] {
  return grants.flatMap((grant, index) => [
    { assetId: grant.featureAssetId, path: ["featureGrants", index, "featureAssetId"], assetTypes: ["FEATURE"] },
    ...(grant.targetFeatureAssetId === null
      ? []
      : [
          {
            assetId: grant.targetFeatureAssetId,
            path: ["featureGrants", index, "targetFeatureAssetId"],
            assetTypes: ["FEATURE" as const],
          },
        ]),
  ]);
}

/** Spells the item casts. */
export function collectSpellReferences(spells: readonly ItemSpell[]): AssetReference[] {
  return spells.map((spell, index) => ({
    assetId: spell.spellAssetId,
    path: ["spells", index, "spellAssetId"],
    assetTypes: ["SPELL"],
  }));
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

/**
 * Grants and spells without hidden assets: a grant of a feature or a spell the player may not see
 * is left out entirely, with an upgrade or replacement whose target is hidden.
 */
export function toPlayerParts<T extends Pick<ItemDefinitionParts, "featureGrants" | "spells">>(
  parts: T,
  isVisible: (assetId: string) => boolean,
): T {
  return {
    ...parts,
    featureGrants: parts.featureGrants.filter(
      (grant) =>
        isVisible(grant.featureAssetId) &&
        (grant.targetFeatureAssetId === null || isVisible(grant.targetFeatureAssetId)),
    ),
    spells: parts.spells.filter((spell) => isVisible(spell.spellAssetId)),
  };
}
