import type { CampaignFactValue } from "#core/rules/campaignFacts";
import type { DieFaces } from "#core/rules/contracts";
import {
  evaluatePredicateExpression,
  resolveEffectPayload,
  type ResolvedEffectPayload,
} from "#core/rules/evaluator";
import type {
  SpellChoice,
  SpellDefinition,
  SpellScalingTrack,
} from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import { buildSpellVocabulary, scalingVariable } from "#src/modules/spells/domain/SpellDefinition";
import type { SpellRow } from "#src/modules/spells/domain/repository/SpellsRepository";

export type SpellCastInput = {
  characterLevel: number;
  slotLevel: number | null;
  caster: {
    modifier?: number | undefined;
    attackBonus?: number | undefined;
    saveDc?: number | undefined;
    proficiencyBonus?: number | undefined;
  };
  choices: Record<string, string[]>;
};

export type ResolvedScalingValue = {
  key: string;
  scaleBy: SpellScalingTrack["scaleBy"];
  valueType: SpellScalingTrack["valueType"];
  /** The level the track was read at; null when nothing applies yet. */
  atLevel: number;
  value: unknown;
};

export type ResolvedSpellEffect = {
  key: string;
  targetKey: string | null;
  resolution: string;
  saveAbility: string | null;
  onSave: string | null;
  dependsOnEffectKeys: string[];
  /** Whether the condition holds; `UNKNOWN` when a value it needs is missing. */
  applies: CampaignFactValue;
  payload: ResolvedEffectPayload;
  reasons: string[];
};

/** Why a cast can't be proposed as asked; the caller turns it into a 409. */
export class SpellCastError extends Error {
  constructor(
    message: string,
    readonly path: (string | number)[],
  ) {
    super(message);
  }
}

/**
 * The slot a spell is cast with: none for cantrips, otherwise the requested one, at least the spell
 * level, or the spell level itself.
 */
export function resolveSlotLevel(level: number, requested: number | null): number | null {
  if (level === 0) {
    if (requested !== null) {
      throw new SpellCastError("Cantrips are cast without a spell slot", ["slotLevel"]);
    }

    return null;
  }

  if (requested !== null && requested < level) {
    throw new SpellCastError(`A level ${level} spell needs a slot of level ${level} or higher`, ["slotLevel"]);
  }

  return requested ?? level;
}

/** The value of a track at a level: the last step reached, or null below the first one. */
export function scalingValueAt(track: SpellScalingTrack, level: number): unknown {
  let value: unknown = null;

  for (const step of track.values) {
    if (step.minimumLevel <= level) {
      value = step.value;
    }
  }

  return value;
}

/**
 * Checks the answers to the spell's choices: known keys, the number of selections, and fixed
 * option codes (or any value for choices with a filter, which the client resolves). `isVisible`
 * hides options linked to assets the player may not see; answering them is refused like an
 * unknown option.
 */
export function checkSpellChoices(
  choices: readonly SpellChoice[],
  answers: Record<string, string[]>,
  isVisible: (assetId: string) => boolean,
): Record<string, string[]> {
  const known = new Map(choices.map((choice) => [choice.key, choice]));

  for (const key of Object.keys(answers)) {
    if (!known.has(key)) {
      throw new SpellCastError(`Unknown choice '${key}'`, ["choices", key]);
    }
  }

  const result: Record<string, string[]> = {};

  for (const choice of choices) {
    const values = answers[choice.key] ?? [];

    if (new Set(values).size !== values.length) {
      throw new SpellCastError(`Choice '${choice.key}' repeats a value`, ["choices", choice.key]);
    }

    if (values.length < choice.minimumSelections || values.length > choice.maximumSelections) {
      throw new SpellCastError(
        `Choice '${choice.key}' needs ${choice.minimumSelections} to ${choice.maximumSelections} selections`,
        ["choices", choice.key],
      );
    }

    if (choice.optionFilter === null) {
      const codes = new Set(
        choice.options
          .filter((option) => option.linkedAssetId === null || isVisible(option.linkedAssetId))
          .map((option) => option.code),
      );
      const unknown = values.find((value) => !codes.has(value));

      if (unknown !== undefined) {
        throw new SpellCastError(`Choice '${choice.key}' has no option '${unknown}'`, ["choices", choice.key]);
      }
    }

    result[choice.key] = values;
  }

  return result;
}

/**
 * Resolves a spell for one cast without storing or spending anything: the slot, the scaling values
 * at the character and slot level, and every effect with its numbers and whether its condition
 * holds. What the cast would use (slot, consumed materials, concentration) is reported, never
 * changed; slots and concentration are state of the actor.
 */
export function resolveSpellCast(
  spell: SpellRow,
  definition: SpellDefinition,
  input: SpellCastInput,
  isVisible: (assetId: string) => boolean = () => true,
) {
  const slotLevel = resolveSlotLevel(spell.level, input.slotLevel);
  const choices = checkSpellChoices(definition.choices, input.choices, isVisible);
  const { valueKeys } = buildSpellVocabulary({ level: spell.level, scalingTracks: definition.scalingTracks });
  const values: Record<string, number> = {
    "level.character": input.characterLevel,
    "level.spell": spell.level,
  };
  const dice: Record<string, { count: number; faces: DieFaces }> = {};

  if (slotLevel !== null) {
    values["slot.level"] = slotLevel;
    values["slot.above"] = slotLevel - spell.level;
  }

  const casterValues: [string, number | undefined][] = [
    ["caster.modifier", input.caster.modifier],
    ["caster.attackBonus", input.caster.attackBonus],
    ["caster.saveDc", input.caster.saveDc],
    ["proficiencyBonus", input.caster.proficiencyBonus],
  ];

  for (const [key, value] of casterValues) {
    if (value !== undefined) {
      values[key] = value;
    }
  }

  const scaling: ResolvedScalingValue[] = definition.scalingTracks.map((track) => {
    const atLevel = track.scaleBy === "SLOT_LEVEL" ? (slotLevel ?? 0) : input.characterLevel;
    const value = scalingValueAt(track, atLevel);
    const variable = scalingVariable(track.key);

    if (value !== null) {
      if (track.valueType === "DIE") {
        dice[variable] = value as { count: number; faces: DieFaces };
      } else if (track.valueType === "DISTANCE") {
        values[variable] = (value as { amount: number }).amount;
      } else if (track.valueType !== "TEXT") {
        values[variable] = value as number;
      }
    }

    return { key: track.key, scaleBy: track.scaleBy, valueType: track.valueType, atLevel, value };
  });

  const effects: ResolvedSpellEffect[] = [...definition.effects]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((effect) => {
      const condition = effect.condition
        ? evaluatePredicateExpression(effect.condition, { values, allowedValueKeys: valueKeys })
        : null;
      const resolved = resolveEffectPayload(effect.payload, { values, allowedValueKeys: valueKeys, dice });

      return {
        key: effect.key,
        targetKey: effect.targetKey,
        resolution: effect.resolution,
        saveAbility: effect.saveAbility,
        onSave: effect.onSave,
        dependsOnEffectKeys: effect.dependsOnEffectKeys,
        applies: condition?.outcome ?? "TRUE",
        payload: resolved.payload,
        reasons: [...(condition?.reasons ?? []), ...resolved.reasons],
      };
    });

  return {
    characterLevel: input.characterLevel,
    slotLevel,
    choices,
    scaling,
    effects,
    uses: {
      /** The slot level the cast would spend; null for cantrips (and rituals cast as such). */
      slotLevel,
      canBeCastAsRitual: spell.isRitual,
      startsConcentration: spell.requiresConcentration,
      consumedMaterials: definition.materials.filter((material) => material.consumed),
    },
    caster: {
      attackBonus: input.caster.attackBonus ?? null,
      saveDc: input.caster.saveDc ?? null,
    },
  };
}

export type ResolvedSpellCast = ReturnType<typeof resolveSpellCast>;
