import type { CampaignFactValue } from "#core/rules/campaignFacts";
import type { DieFaces } from "#core/rules/contracts";
import {
  evaluatePredicateExpression,
  resolveEffectPayload,
  type ResolvedEffectPayload,
} from "#core/rules/evaluator";
import { abilityModifier, type ActorSnapshot } from "#src/modules/features/index";
import type { ItemActivation, ItemDefinitionParts } from "#src/modules/items/domain/dto/ItemDefinitionDto";
import { buildItemVocabulary, type ItemColumns } from "#src/modules/items/domain/ItemDefinition";

/** The state an item is in for one actor. */
export type ItemUseState = {
  /** The actor has the item. Without it nothing of the item works for the actor. */
  carried: boolean;
  equipped: boolean;
  attuned: boolean;
  currentCharges: number | null;
};

export type ItemResolveInput = {
  actor: ActorSnapshot;
  state: ItemUseState;
  attack: { twoHanded: boolean; proficient?: boolean | undefined };
};

/** The item fields the calculation reads. */
export type ResolvableItem = ItemColumns &
  Pick<ItemDefinitionParts, "weaponProperties" | "effects" | "featureGrants" | "spells"> & {
    code: string;
    assetId: string;
  };

export type ResolvedItemEffect = {
  key: string;
  label: string | null;
  activation: ItemActivation;
  /** Whether the item is in the state the effect needs (equipped, attuned …). */
  active: boolean;
  /** Whether its condition holds; `UNKNOWN` when a value it needs is missing. */
  applies: CampaignFactValue;
  chargeCost: number;
  payload: ResolvedEffectPayload;
  reasons: string[];
};

export type ItemTotals = {
  modifiers: Record<string, number>;
  baseValues: Record<string, number>;
  grants: { grantType: string; value: string }[];
  advantages: { mode: "ADVANTAGE" | "DISADVANTAGE"; on: string }[];
};

const ARMOR_PROFICIENCIES: Record<string, string> = {
  LIGHT: "light-armor",
  MEDIUM: "medium-armor",
  HEAVY: "heavy-armor",
  SHIELD: "shields",
};

const WEAPON_PROFICIENCIES: Record<string, string> = {
  SIMPLE: "simple-weapons",
  MARTIAL: "martial-weapons",
};

export { abilityModifier };

/**
 * Whether the item works at all for its holder: an item that requires attunement does nothing
 * magical before the holder is attuned to it.
 */
function isFunctional(item: ResolvableItem, state: ItemUseState): boolean {
  return state.carried && (item.attunementMode !== "REQUIRED" || state.attuned);
}

/** Whether the item is in the state an effect, grant or spell needs. */
export function isActive(activation: ItemActivation, item: ResolvableItem, state: ItemUseState): boolean {
  if (!isFunctional(item, state)) {
    return false;
  }

  switch (activation) {
    case "CARRIED":
    case "ON_USE":
      return true;
    case "EQUIPPED":
      return state.equipped;
    case "ATTUNED":
      return state.attuned;
  }
}

/** Proficient from the actor's codes, unknown without them, or as the caller says. */
function proficiencyOf(
  actor: ActorSnapshot,
  item: ResolvableItem,
  categoryCode: string | undefined,
  override: boolean | undefined,
): boolean | null {
  if (override !== undefined) {
    return override;
  }

  if (actor.proficiencies === undefined) {
    return null;
  }

  const codes = new Set(actor.proficiencies);

  return (categoryCode !== undefined && codes.has(categoryCode)) || codes.has(item.code) || codes.has(item.assetId);
}

function modifierOf(actor: ActorSnapshot, ability: "str" | "dex"): number | null {
  const score = actor.abilities?.[ability];

  return score === undefined ? null : abilityModifier(score);
}

function sum(...values: (number | null)[]): number | null {
  return values.some((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value as number), 0);
}

/**
 * Attack and damage of a weapon for the actor: Strength for melee, Dexterity for ranged weapons,
 * the better of both for finesse weapons; the proficiency bonus when proficient; the magic bonus
 * once the weapon works for its holder (attuned if it requires attunement). Versatile weapons use
 * their two-handed die on request. Nothing is rolled.
 */
function resolveWeapon(item: ResolvableItem, input: ItemResolveInput, functional: boolean) {
  const reasons: string[] = [];
  const properties = new Set(item.weaponProperties);
  const str = modifierOf(input.actor, "str");
  const dex = modifierOf(input.actor, "dex");
  let attackAbility: "str" | "dex" | null;
  let abilityMod: number | null;

  if (properties.has("FINESSE")) {
    attackAbility = str === null || dex === null ? null : dex > str ? "dex" : "str";
    abilityMod = str === null || dex === null ? null : Math.max(str, dex);
  } else {
    attackAbility = item.weaponCombatType === "RANGED" ? "dex" : "str";
    abilityMod = attackAbility === "dex" ? dex : str;
  }

  if (abilityMod === null) {
    reasons.push("Missing ability scores");
  }

  const proficient = proficiencyOf(
    input.actor,
    item,
    WEAPON_PROFICIENCIES[item.weaponCategory ?? ""],
    input.attack.proficient,
  );
  const proficiencyBonus = input.actor.proficiencyBonus ?? null;

  if (proficient === null) {
    reasons.push("Missing proficiencies");
  } else if (proficient && proficiencyBonus === null) {
    reasons.push("Missing proficiency bonus");
  }

  const magicBonus = functional ? item.magicBonus : 0;
  const twoHanded = input.attack.twoHanded && properties.has("VERSATILE") && item.versatileDiceFaces !== null;

  if (input.attack.twoHanded && !twoHanded) {
    reasons.push("Only versatile weapons have a two-handed die");
  }

  const dice =
    item.damageDiceCount !== null && item.damageDiceFaces !== null
      ? {
          count: item.damageDiceCount,
          faces: (twoHanded ? item.versatileDiceFaces : item.damageDiceFaces) as DieFaces,
        }
      : null;

  return {
    weaponCategory: item.weaponCategory,
    combatType: item.weaponCombatType,
    properties: [...item.weaponProperties],
    mastery: item.masteryProperty,
    attackAbility,
    abilityModifier: abilityMod,
    proficient,
    proficiencyBonus: proficient === false ? 0 : proficiencyBonus,
    magicBonus,
    attackBonus: sum(abilityMod, proficient === null ? null : proficient ? proficiencyBonus : 0, magicBonus),
    damage: {
      dice,
      fixed: item.damageFixed,
      bonus: sum(abilityMod, magicBonus),
      damageType: item.damageType,
      twoHanded,
    },
    range: item.rangeNormal !== null && item.rangeLong !== null ? { normal: item.rangeNormal, long: item.rangeLong } : null,
    reasons,
  };
}

/**
 * The armor class worn armor gives: its base, the Dexterity modifier as its mode allows and the
 * magic bonus once it works. A shield adds its bonus plus its magic bonus instead.
 */
function resolveArmor(item: ResolvableItem, input: ItemResolveInput, functional: boolean) {
  const reasons: string[] = [];
  const magicBonus = functional ? item.magicBonus : 0;
  const base = item.baseArmorClass ?? 0;
  const proficient = proficiencyOf(
    input.actor,
    item,
    ARMOR_PROFICIENCIES[item.armorCategory ?? ""],
    undefined,
  );

  if (item.armorCategory === "SHIELD") {
    return {
      armorCategory: item.armorCategory,
      baseArmorClass: base,
      dexterityMode: item.dexterityMode,
      dexterityCap: item.dexterityCap,
      dexterityBonus: 0,
      magicBonus,
      armorClass: null,
      armorClassBonus: base + magicBonus,
      strengthRequirement: null,
      meetsStrengthRequirement: null,
      stealthDisadvantage: false,
      proficient,
      reasons,
    };
  }

  const dex = modifierOf(input.actor, "dex");
  let dexterityBonus: number | null = 0;

  if (item.dexterityMode !== "NONE") {
    if (dex === null) {
      reasons.push("Missing ability scores");
      dexterityBonus = null;
    } else {
      dexterityBonus = item.dexterityMode === "CAPPED" ? Math.min(dex, item.dexterityCap ?? 0) : dex;
    }
  }

  const strength = input.actor.abilities?.str;

  return {
    armorCategory: item.armorCategory,
    baseArmorClass: base,
    dexterityMode: item.dexterityMode,
    dexterityCap: item.dexterityCap,
    dexterityBonus,
    magicBonus,
    armorClass: sum(base, dexterityBonus, magicBonus),
    armorClassBonus: null,
    strengthRequirement: item.strengthRequirement,
    meetsStrengthRequirement:
      item.strengthRequirement === null ? true : strength === undefined ? null : strength >= item.strengthRequirement,
    stealthDisadvantage: item.stealthDisadvantage,
    proficient,
    reasons,
  };
}

/** Values the item's expressions may read: the actor's, the magic bonus and the charges. */
function valuesOf(item: ResolvableItem, input: ItemResolveInput): Record<string, number> {
  const values: Record<string, number> = { ...contextValuesOf(input.actor), "item.magicBonus": item.magicBonus };

  if (item.chargesMaximum !== null) {
    values["charges.maximum"] = item.chargesMaximum;
    values["charges.current"] = input.state.currentCharges ?? item.chargesMaximum;
  }

  return values;
}

/** Adds up passive effects that are active and apply: like the totals of features. */
export function addUpEffects(effects: readonly ResolvedItemEffect[]): ItemTotals {
  const totals: ItemTotals = { modifiers: {}, baseValues: {}, grants: [], advantages: [] };
  const grantKeys = new Set<string>();

  for (const effect of effects) {
    if (!effect.active || effect.activation === "ON_USE" || effect.applies !== "TRUE") {
      continue;
    }

    const { payload } = effect;

    switch (payload.type) {
      case "MODIFIER":
        if (payload.amount !== null) {
          totals.modifiers[payload.stat] = (totals.modifiers[payload.stat] ?? 0) + payload.amount;
        }
        break;
      case "BASE_VALUE":
        // The highest base value applies.
        if (payload.value !== null) {
          totals.baseValues[payload.stat] = Math.max(totals.baseValues[payload.stat] ?? payload.value, payload.value);
        }
        break;
      case "GRANT": {
        const key = `${payload.grantType}:${payload.value}`;

        if (!grantKeys.has(key)) {
          grantKeys.add(key);
          totals.grants.push({ grantType: payload.grantType, value: payload.value });
        }
        break;
      }
      case "ADVANTAGE":
        totals.advantages.push({ mode: payload.mode, on: payload.on });
        break;
      default:
        break;
    }
  }

  return totals;
}

/**
 * What an item gives an actor in a state, without storing or spending anything: attack and damage
 * of a weapon, armor class of armor or the bonus of a shield, every effect with its numbers and
 * whether it is active and applies, the passive effects added up, and which spells and granted
 * features are active. Granted features are resolved by the caller, which needs the database.
 *
 * The character modules add the totals to their own: `armor.armorClass` replaces the unarmored
 * armor class, `armor.armorClassBonus` (shields) and `totals.modifiers.ac` are added to it.
 */
export function resolveItem(item: ResolvableItem, input: ItemResolveInput) {
  const functional = isFunctional(item, input.state);
  const reasons: string[] = [];

  if (!input.state.carried) {
    reasons.push("The item is not carried, so none of its effects work");
  } else if (!functional) {
    reasons.push("The item requires attunement before its magic works");
  }

  const chargesCurrent =
    item.chargesMaximum === null ? null : Math.min(input.state.currentCharges ?? item.chargesMaximum, item.chargesMaximum);
  const values = valuesOf(item, input);
  const allowedValueKeys = buildItemVocabulary(item);

  const effects: ResolvedItemEffect[] = [...item.effects]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((effect) => {
      const condition = effect.condition
        ? evaluatePredicateExpression(effect.condition, {
            values,
            allowedValueKeys,
            ...(input.actor.characterLevel !== undefined ? { actorLevel: input.actor.characterLevel } : {}),
            ...(input.actor.abilities ? { abilities: input.actor.abilities as Record<string, number> } : {}),
            ...(input.actor.proficiencies ? { proficiencies: new Set(input.actor.proficiencies) } : {}),
            ...(input.actor.ownedAssetIds ? { ownedAssetIds: new Set(input.actor.ownedAssetIds) } : {}),
            ...(input.actor.tags ? { tags: new Set(input.actor.tags) } : {}),
            ...(input.actor.facts ? { facts: input.actor.facts } : {}),
          })
        : null;
      const resolved = resolveEffectPayload(effect.payload, { values, allowedValueKeys });

      return {
        key: effect.key,
        label: effect.label,
        activation: effect.activation,
        active: isActive(effect.activation, item, input.state),
        applies: condition?.outcome ?? "TRUE",
        chargeCost: effect.chargeCost,
        payload: resolved.payload,
        reasons: [...(condition?.reasons ?? []), ...resolved.reasons],
      };
    });

  return {
    state: {
      carried: input.state.carried,
      equipped: input.state.equipped,
      attuned: input.state.attuned,
      functional,
      chargesCurrent,
      chargesMaximum: item.chargesMaximum,
    },
    weapon: item.category === "WEAPON" ? resolveWeapon(item, input, functional) : null,
    armor: item.armorCategory !== null ? { ...resolveArmor(item, input, functional), active: functional && input.state.equipped } : null,
    effects,
    totals: addUpEffects(effects),
    spells: [...item.spells]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((spell) => ({
        key: spell.key,
        spellAssetId: spell.spellAssetId,
        chargeCost: spell.chargeCost,
        castAtLevel: spell.castAtLevel,
        saveDc: spell.saveDc,
        attackBonus: spell.attackBonus,
        activation: spell.activation,
        active: isActive(spell.activation, item, input.state),
        /** Enough charges left for one cast. */
        available:
          isActive(spell.activation, item, input.state) && (chargesCurrent === null || chargesCurrent >= spell.chargeCost),
      })),
    featureGrants: [...item.featureGrants]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((grant) => ({
        key: grant.key,
        featureAssetId: grant.featureAssetId,
        operation: grant.operation,
        targetFeatureAssetId: grant.targetFeatureAssetId,
        activation: grant.activation,
        active: isActive(grant.activation, item, input.state),
      })),
    reasons,
  };
}

export type ResolvedItem = ReturnType<typeof resolveItem>;

/** Context values a binding of a granted feature may read, from the actor. */
export function contextValuesOf(actor: ActorSnapshot): Record<string, number> {
  const values: Record<string, number> = {};

  if (actor.characterLevel !== undefined) {
    values["level.character"] = actor.characterLevel;
  }

  if (actor.proficiencyBonus !== undefined) {
    values.proficiencyBonus = actor.proficiencyBonus;
  }

  for (const [ability, score] of Object.entries(actor.abilities ?? {})) {
    if (score !== undefined) {
      values[`ability.${ability}`] = score;
      values[`ability.${ability}.modifier`] = abilityModifier(score);
    }
  }

  return values;
}
