import { abilityModifier, ABILITIES, type ActorSnapshot } from "#src/modules/features/index";
import type { ResolvedItem } from "#src/modules/items/index";
import {
  type Ability,
  type ActorParts,
  HIT_DICE_FORMULA,
  SKILL_CODES,
  SKILLS,
  type SkillCode,
} from "#src/modules/actors/domain/dto/ActorPartsDto";

/**
 * An item instance the actor owns, with what its definition gives for an actor snapshot. The
 * service loads the definitions; the calculation here needs no database.
 */
export type StatBlockItem = {
  instanceId: string;
  itemAssetId: string;
  name: string;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  resolve(actor: ActorSnapshot): ResolvedItem;
};

/** Where a value comes from: given in the actor (`SET`, `OVERRIDE`) or computed. */
export type ValueSource = "SET" | "OVERRIDE" | "CALCULATED";

const SKILL_FACTORS = { NONE: 0, HALF: 0.5, PROFICIENT: 1, EXPERTISE: 2 } as const;

const clampScore = (score: number) => Math.min(30, Math.max(1, score));

/** Stat keys of item effects are written as `ability.str`, `ability.STR` …; compare them lower case. */
function statOf(totals: Record<string, number>, key: string): number {
  return Object.entries(totals).reduce(
    (sum, [stat, value]) => (stat.toLowerCase() === key ? sum + value : sum),
    0,
  );
}

function baseValueOf(totals: Record<string, number>, key: string): number | null {
  const values = Object.entries(totals)
    .filter(([stat]) => stat.toLowerCase() === key)
    .map(([, value]) => value);

  return values.length > 0 ? Math.max(...values) : null;
}

type ItemTotals = {
  modifiers: Record<string, number>;
  baseValues: Record<string, number>;
};

/** Adds up the passive totals of several items: modifiers add, the highest base value wins. */
function addUpItems(resolved: readonly ResolvedItem[]): ItemTotals {
  const totals: ItemTotals = { modifiers: {}, baseValues: {} };

  for (const item of resolved) {
    for (const [stat, value] of Object.entries(item.totals.modifiers)) {
      totals.modifiers[stat] = (totals.modifiers[stat] ?? 0) + value;
    }

    for (const [stat, value] of Object.entries(item.totals.baseValues)) {
      totals.baseValues[stat] = Math.max(totals.baseValues[stat] ?? value, value);
    }
  }

  return totals;
}

/** The average of a formula such as `7d8 + 14`, rounded down like the printed stat blocks. */
export function averageOfFormula(formula: string): number | null {
  const match = HIT_DICE_FORMULA.exec(formula.trim());

  if (!match) {
    return null;
  }

  const [, count, faces, sign, bonus] = match;
  const dice = Math.floor((Number(count) * (Number(faces) + 1)) / 2);
  const modifier = bonus === undefined ? 0 : (sign === "-" ? -1 : 1) * Number(bonus);

  return Math.max(1, dice + modifier);
}

/**
 * Computes the stat block of an actor from its base values and the items it owns. Nothing is stored:
 * modifiers, saving throws, skills, passive perception, armor class, hit points, initiative and attacks
 * all follow from the parts. Values the actor sets replace the computed ones and say so (`source`).
 * Classes, species, background and feats come with the progression; until then the proficiency bonus
 * and hit points come from the combat values, and `reasons` names what is missing.
 */
export function computeStatBlock(parts: ActorParts, items: readonly StatBlockItem[]) {
  const reasons: string[] = [];
  const proficiencyBonus = parts.combat.proficiencyBonus;
  const proficiencyCodes = parts.proficiencies.map((entry) => (entry.code ?? entry.itemAssetId) as string);

  if (proficiencyBonus === null) {
    reasons.push("No proficiency bonus: set one in the combat values (class levels come later)");
  }

  const baseScores = Object.fromEntries(
    ABILITIES.map((ability) => [ability, parts.abilities[ability].score]),
  ) as Record<Ability, number>;
  const snapshot = (abilities: Record<Ability, number>): ActorSnapshot => ({
    abilities,
    proficiencies: proficiencyCodes,
    ...(proficiencyBonus !== null ? { proficiencyBonus } : {}),
  });

  // Items that change ability scores first, then everything else with the final scores.
  const firstPass = addUpItems(items.map((item) => item.resolve(snapshot(baseScores))));
  const scores = Object.fromEntries(
    ABILITIES.map((ability) => {
      const entry = parts.abilities[ability];

      if (entry.scoreOverride !== null) {
        return [ability, entry.scoreOverride];
      }

      const raised = entry.score + statOf(firstPass.modifiers, `ability.${ability}`);
      const set = baseValueOf(firstPass.baseValues, `ability.${ability}`);

      return [ability, clampScore(set !== null && set > raised ? set : raised)];
    }),
  ) as Record<Ability, number>;
  const resolvedItems = items.map((item) => ({ item, resolved: item.resolve(snapshot(scores)) }));
  const totals = addUpItems(resolvedItems.map(({ resolved }) => resolved));
  const modifiers = Object.fromEntries(
    ABILITIES.map((ability) => [ability, abilityModifier(scores[ability])]),
  ) as Record<Ability, number>;
  const withProficiency = (modifier: number, factor: number): number | null => {
    if (factor === 0) {
      return modifier;
    }

    return proficiencyBonus === null ? null : modifier + Math.floor(proficiencyBonus * factor);
  };

  const abilities = ABILITIES.map((ability) => {
    const entry = parts.abilities[ability];
    const computedSave = withProficiency(modifiers[ability], entry.savingThrowProficient ? 1 : 0);

    return {
      ability,
      baseScore: entry.score,
      score: scores[ability],
      scoreSource: (entry.scoreOverride !== null ? "OVERRIDE" : "CALCULATED") as ValueSource,
      modifier: modifiers[ability],
      savingThrow: {
        proficient: entry.savingThrowProficient,
        bonus: entry.savingThrowBonusOverride ?? computedSave,
        source: (entry.savingThrowBonusOverride !== null ? "OVERRIDE" : "CALCULATED") as ValueSource,
      },
      overrideReason: entry.overrideReason,
    };
  });

  const skillEntries = new Map(parts.skills.map((entry) => [entry.skill, entry]));
  const skills = SKILL_CODES.map((skill: SkillCode) => {
    const entry = skillEntries.get(skill);
    const ability: Ability = entry?.ability ?? SKILLS[skill];
    const proficiency = entry?.proficiency ?? "NONE";
    const computed = withProficiency(modifiers[ability], SKILL_FACTORS[proficiency]);

    return {
      skill,
      ability,
      proficiency,
      bonus: entry?.bonusOverride ?? computed,
      source: (entry?.bonusOverride != null ? "OVERRIDE" : "CALCULATED") as ValueSource,
      overrideReason: entry?.overrideReason ?? null,
    };
  });
  const perception = skills.find((skill) => skill.skill === "perception")?.bonus ?? null;

  // Armor class: set, or the best base (worn armor, an item's base value, 10 + Dexterity) plus shields
  // and modifiers.
  const wornArmor = resolvedItems
    .filter(({ resolved }) => resolved.armor?.active && resolved.armor.armorClass !== null)
    .map(({ item, resolved }) => ({ item, armorClass: resolved.armor?.armorClass as number }));
  const shields = resolvedItems
    .filter(({ resolved }) => resolved.armor?.active && resolved.armor.armorClassBonus !== null)
    .map(({ item, resolved }) => ({ item, bonus: resolved.armor?.armorClassBonus as number }));

  if (wornArmor.length > 1) {
    reasons.push("More than one armor is equipped; the best one counts");
  }

  const armorBase = [...wornArmor].sort((a, b) => b.armorClass - a.armorClass)[0] ?? null;
  const unarmored = 10 + modifiers.dex;
  const itemBase = baseValueOf(totals.baseValues, "ac");
  const base = Math.max(armorBase?.armorClass ?? unarmored, itemBase ?? 0);
  const shieldBonus = shields.reduce((sum, shield) => sum + shield.bonus, 0);
  const acModifier = statOf(totals.modifiers, "ac");
  const armorClass =
    parts.combat.armorClass !== null
      ? { value: parts.combat.armorClass, source: "SET" as ValueSource, note: parts.combat.armorClassNote, base: null, armorInstanceId: null, shieldBonus: 0, modifiers: 0 }
      : {
          value: base + shieldBonus + acModifier,
          source: "CALCULATED" as ValueSource,
          note: parts.combat.armorClassNote,
          base,
          armorInstanceId: armorBase && armorBase.armorClass === base ? armorBase.item.instanceId : null,
          shieldBonus,
          modifiers: acModifier,
        };

  const formulaAverage =
    parts.combat.hitPointFormula !== null ? averageOfFormula(parts.combat.hitPointFormula) : null;
  const hitPoints = {
    maximum: parts.combat.hitPointMaximum ?? formulaAverage,
    formula: parts.combat.hitPointFormula,
    source: (parts.combat.hitPointMaximum !== null ? "SET" : "CALCULATED") as ValueSource,
  };

  if (hitPoints.maximum === null) {
    reasons.push("No hit points: set a maximum or a formula (class levels come later)");
  }

  const initiativeModifier = statOf(totals.modifiers, "initiative");
  const initiative = {
    bonus: parts.combat.initiativeBonus ?? modifiers.dex + initiativeModifier,
    source: (parts.combat.initiativeBonus !== null ? "SET" : "CALCULATED") as ValueSource,
  };

  const attacks = [
    ...parts.traits
      .filter((trait) => trait.attack !== null)
      .map((trait) => ({
        source: "TRAIT" as const,
        key: trait.key,
        instanceId: null,
        name: trait.name,
        kind: trait.kind,
        attackType: trait.attack?.type ?? null,
        attackBonus: trait.attack?.attackBonus ?? null,
        reachFeet: trait.attack?.reachFeet ?? null,
        rangeNormalFeet: trait.attack?.rangeNormalFeet ?? null,
        rangeLongFeet: trait.attack?.rangeLongFeet ?? null,
        damage: (trait.attack?.damage ?? []).map((damage) => ({
          diceCount: damage.diceCount,
          diceFaces: damage.diceFaces as number | null,
          bonus: damage.bonus as number | null,
          damageType: damage.damageType as string | null,
        })),
        reasons: [] as string[],
      })),
    ...resolvedItems
      .filter(({ item, resolved }) => item.equipped && resolved.weapon !== null)
      .map(({ item, resolved }) => {
        const weapon = resolved.weapon as NonNullable<ResolvedItem["weapon"]>;

        return {
          source: "ITEM" as const,
          key: null,
          instanceId: item.instanceId,
          name: item.name,
          kind: "ACTION" as const,
          attackType: weapon.combatType === "RANGED" ? "RANGED_WEAPON" : "MELEE_WEAPON",
          attackBonus: weapon.attackBonus,
          reachFeet: weapon.combatType === "RANGED" ? null : weapon.properties.includes("REACH") ? 10 : 5,
          rangeNormalFeet: weapon.range?.normal ?? null,
          rangeLongFeet: weapon.range?.long ?? null,
          damage: [
            {
              diceCount: weapon.damage.dice?.count ?? null,
              diceFaces: weapon.damage.dice?.faces ?? null,
              bonus: weapon.damage.bonus,
              damageType: weapon.damage.damageType,
            },
          ],
          reasons: weapon.reasons,
        };
      }),
  ];

  const effects = resolvedItems.flatMap(({ item, resolved }) =>
    resolved.effects
      .filter((effect) => effect.active)
      .map((effect) => ({
        instanceId: item.instanceId,
        key: effect.key,
        label: effect.label,
        activation: effect.activation,
        applies: effect.applies,
        payload: effect.payload,
      })),
  );

  return {
    proficiencyBonus: {
      value: proficiencyBonus,
      source: (proficiencyBonus !== null ? "SET" : "CALCULATED") as ValueSource,
    },
    abilities,
    skills,
    passivePerception: perception === null ? null : 10 + perception,
    armorClass,
    hitPoints,
    initiative,
    speeds: parts.speeds,
    senses: parts.senses,
    languages: parts.languages,
    defenses: parts.defenses,
    proficiencies: parts.proficiencies,
    traits: [...parts.traits].sort((a, b) => a.displayOrder - b.displayOrder),
    attacks,
    items: resolvedItems.map(({ item, resolved }) => ({
      instanceId: item.instanceId,
      itemAssetId: item.itemAssetId,
      name: item.name,
      quantity: item.quantity,
      equipped: item.equipped,
      attuned: item.attuned,
      functional: resolved.state.functional,
    })),
    itemEffects: {
      effects,
      modifiers: totals.modifiers,
      baseValues: totals.baseValues,
      grants: resolvedItems.flatMap(({ item, resolved }) =>
        resolved.totals.grants.map((grant) => ({ instanceId: item.instanceId, ...grant })),
      ),
      features: resolvedItems.flatMap(({ item, resolved }) =>
        resolved.featureGrants
          .filter((grant) => grant.active)
          .map((grant) => ({
            instanceId: item.instanceId,
            featureAssetId: grant.featureAssetId,
            operation: grant.operation,
          })),
      ),
      spells: resolvedItems.flatMap(({ item, resolved }) =>
        resolved.spells
          .filter((spell) => spell.active)
          .map((spell) => ({
            instanceId: item.instanceId,
            spellAssetId: spell.spellAssetId,
            castAtLevel: spell.castAtLevel,
            available: spell.available,
          })),
      ),
    },
    reasons,
  };
}

export type ComputedStatBlock = ReturnType<typeof computeStatBlock>;
