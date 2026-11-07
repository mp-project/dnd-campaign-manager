import type { CampaignFactValue } from "#core/rules/campaignFacts";
import type { DieFaces } from "#core/rules/contracts";
import {
  evaluatePredicateExpression,
  evaluateValueExpression,
  resolveEffectPayload,
  type ResolvedEffectPayload,
  type ValueEvaluationContext,
} from "#core/rules/evaluator";
import {
  ABILITIES,
  buildVocabulary,
  type DefinitionIssue,
  parameterVariable,
  resourceVariable,
  scalingVariable,
} from "#src/modules/features/domain/FeatureDefinition";
import {
  checkTypedValue,
  type DieValue,
  type DistanceValue,
  type FeatureChoiceOption,
  type FeatureGraph,
  type FeatureScalingTrack,
} from "#src/modules/features/domain/dto/FeatureDefinitionDto";
import type { FeatureStackingMode } from "#src/modules/features/domain/dto/BaseFeatureDto";

export type Ability = (typeof ABILITIES)[number];

/** Values a source module stores for its grant of the feature. */
export type FeatureBindings = {
  parameters?: Record<string, unknown> | undefined;
  /** Option codes, or asset ids for choices with a filter. */
  choices?: Record<string, string[]> | undefined;
};

/** What is known about the actor; whatever is missing makes results unknown, not wrong. */
export type ActorSnapshot = {
  characterLevel?: number | undefined;
  classLevel?: number | undefined;
  sourceLevel?: number | undefined;
  proficiencyBonus?: number | undefined;
  abilities?: Partial<Record<Ability, number>> | undefined;
  proficiencies?: string[] | undefined;
  ownedAssetIds?: string[] | undefined;
  tags?: string[] | undefined;
  facts?: Record<string, CampaignFactValue> | undefined;
};

export type ResolvedSelection = {
  code: string | null;
  label: string | null;
  value: unknown;
  /** The linked asset of an option, or the chosen asset of a choice with a filter. */
  assetId: string | null;
};

export type ResolvedFeatureGraph = {
  resolved: true;
  parameters: { key: string; value: unknown; source: "BINDING" | "DEFAULT" | "NONE" }[];
  choices: { key: string; selections: ResolvedSelection[] }[];
  scaling: { key: string; level: number | null; value: unknown }[];
  resources: { key: string; name: string; maximum: number | null; recovery: string }[];
  activations: {
    key: string;
    activationType: string;
    trigger: string | null;
    concentration: boolean;
    duration: { unit: string; amount: number | null } | null;
    costs: { costType: string; resourceKey: string | null; amount: number | null }[];
  }[];
  effects: {
    key: string;
    activationKey: string | null;
    effectType: ResolvedEffectPayload["type"];
    applies: CampaignFactValue;
    payload: ResolvedEffectPayload;
  }[];
  /** Why values are unknown, such as a missing level or ability. */
  reasons: string[];
};

/** Bindings that do not fit the definition; the resolution is refused with these issues. */
export class FeatureBindingError extends Error {
  constructor(public readonly issues: DefinitionIssue[]) {
    super("Bindings do not match the feature definition");
  }
}

const isDie = (value: unknown): value is DieValue =>
  typeof value === "object" && value !== null && "faces" in value && "count" in value;

/** Numeric view of a typed value, for expressions; text and asset references have none. */
function numericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "object" && value !== null && "amount" in value) {
    return (value as DistanceValue).amount;
  }

  return null;
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Proficiency bonus of the 2014 and 2024 rules: +2 at level 1, one more every four levels. */
export function proficiencyBonusFor(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function levelFor(track: Pick<FeatureScalingTrack, "scaleBy">, actor: ActorSnapshot) {
  switch (track.scaleBy) {
    case "CHARACTER_LEVEL":
      return actor.characterLevel ?? null;
    case "CLASS_LEVEL":
      return actor.classLevel ?? null;
    case "SOURCE_LEVEL":
      return actor.sourceLevel ?? null;
  }
}

/** The value of the highest step the level has reached; null below the first step. */
export function scalingValueAt(track: FeatureScalingTrack, level: number | null): unknown {
  if (level === null) {
    return null;
  }

  let value: unknown = null;

  for (const step of track.values) {
    if (step.minimumLevel > level) {
      break;
    }

    value = step.value;
  }

  return value;
}

/**
 * Binds parameters, choices and scaling to a definition and computes all values for one actor.
 * Pure: it reads nothing and changes nothing; asset ids chosen through a filter must already be
 * checked by the caller (`allowedAssetSelections`).
 */
export function resolveFeatureGraph(
  graph: FeatureGraph,
  bindings: FeatureBindings,
  actor: ActorSnapshot,
  allowedAssetSelections: ReadonlySet<string> = new Set(),
): ResolvedFeatureGraph {
  const issues: DefinitionIssue[] = [];
  const reasons: string[] = [];
  const vocabulary = buildVocabulary(graph);
  const values: Record<string, number> = {};
  const dice: Record<string, { count: number; faces: DieFaces }> = {};

  // Actor values
  const setValue = (key: string, value: number | undefined | null) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      values[key] = value;
    }
  };

  setValue("level.character", actor.characterLevel);
  setValue("level.class", actor.classLevel);
  setValue("level.source", actor.sourceLevel);
  setValue(
    "proficiencyBonus",
    actor.proficiencyBonus ??
      (actor.characterLevel !== undefined ? proficiencyBonusFor(actor.characterLevel) : undefined),
  );

  for (const ability of ABILITIES) {
    const score = actor.abilities?.[ability];

    if (score !== undefined) {
      setValue(`ability.${ability}`, score);
      setValue(`ability.${ability}.modifier`, abilityModifier(score));
    }
  }

  // Parameters
  const boundParameters = bindings.parameters ?? {};
  const parameterKeys = new Set(graph.parameters.map((parameter) => parameter.key));

  for (const key of Object.keys(boundParameters)) {
    if (!parameterKeys.has(key)) {
      issues.push({ path: ["parameters", key], message: "Unknown parameter" });
    }
  }

  const parameters = graph.parameters.map((parameter) => {
    const bound = boundParameters[parameter.key];
    let value: unknown = null;
    let source: "BINDING" | "DEFAULT" | "NONE" = "NONE";

    if (bound !== undefined && bound !== null) {
      for (const message of checkTypedValue(parameter.valueType, bound)) {
        issues.push({ path: ["parameters", parameter.key], message });
      }

      value = bound;
      source = "BINDING";
    } else if (parameter.defaultValue !== null) {
      value = parameter.defaultValue;
      source = "DEFAULT";
    } else if (parameter.required) {
      issues.push({
        path: ["parameters", parameter.key],
        message: "Required parameter needs a binding or a default",
      });
    }

    const variable = parameterVariable(parameter.key);

    if (parameter.valueType === "DIE" && isDie(value)) {
      dice[variable] = { count: value.count, faces: value.faces };
    } else {
      setValue(variable, numericValue(value));
    }

    return { key: parameter.key, value, source };
  });

  // Choices
  const boundChoices = bindings.choices ?? {};
  const choiceKeys = new Set(graph.choices.map((choice) => choice.key));

  for (const key of Object.keys(boundChoices)) {
    if (!choiceKeys.has(key)) {
      issues.push({ path: ["choices", key], message: "Unknown choice" });
    }
  }

  const choices = graph.choices.map((choice) => {
    const selected = boundChoices[choice.key] ?? [];
    const path = ["choices", choice.key];

    if (new Set(selected).size !== selected.length) {
      issues.push({ path, message: "Selections must be unique" });
    }

    if (selected.length < choice.minimumSelections || selected.length > choice.maximumSelections) {
      issues.push({
        path,
        message: `Choose between ${choice.minimumSelections} and ${choice.maximumSelections}`,
      });
    }

    const options = new Map<string, FeatureChoiceOption>(
      choice.options.map((option) => [option.code, option]),
    );
    const selections: ResolvedSelection[] = [];

    for (const entry of selected) {
      const option = options.get(entry);

      if (option) {
        selections.push({
          code: option.code,
          label: option.label,
          value: option.value,
          assetId: option.linkedAssetId,
        });
      } else if (choice.optionFilter && allowedAssetSelections.has(entry)) {
        selections.push({ code: null, label: null, value: null, assetId: entry });
      } else {
        issues.push({ path, message: `'${entry}' is not an option of this choice` });
      }
    }

    return { key: choice.key, selections };
  });

  // Scaling
  const scaling = graph.scalingTracks.map((track) => {
    const level = levelFor(track, actor);
    const value = scalingValueAt(track, level);
    const variable = scalingVariable(track.key);

    if (level === null) {
      reasons.push(`Missing level for scaling '${track.key}'`);
    }

    if (track.valueType === "DIE" && isDie(value)) {
      dice[variable] = { count: value.count, faces: value.faces };
    } else {
      setValue(variable, numericValue(value));
    }

    return { key: track.key, level, value };
  });

  if (issues.length > 0) {
    throw new FeatureBindingError(issues);
  }

  // Resources, then everything that may refer to their maximum
  const baseContext: ValueEvaluationContext = {
    values,
    allowedValueKeys: vocabulary.baseValueKeys,
    dice,
  };
  let fullContext = baseContext;
  const evaluate = (
    expression: Parameters<typeof evaluateValueExpression>[0],
    context: ValueEvaluationContext = fullContext,
  ) => {
    const result = evaluateValueExpression(expression, context);

    reasons.push(...result.reasons);

    return result.value;
  };

  const resources = graph.resources.map((resource) => {
    const maximum = evaluate(resource.maximumExpression, baseContext);

    setValue(resourceVariable(resource.key), maximum);

    return { key: resource.key, name: resource.name, maximum, recovery: resource.recovery };
  });

  fullContext = { values, allowedValueKeys: vocabulary.valueKeys, dice };

  const activations = graph.activations.map((activation) => ({
    key: activation.key,
    activationType: activation.activationType,
    trigger: activation.trigger,
    concentration: activation.concentration,
    duration: activation.duration
      ? {
          unit: activation.duration.unit,
          amount: activation.duration.amount ? evaluate(activation.duration.amount) : null,
        }
      : null,
    costs: activation.costs.map((cost) => ({
      costType: cost.costType,
      resourceKey: cost.resourceKey,
      amount: evaluate(cost.amountExpression),
    })),
  }));

  const effects = [...graph.effects]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .map((effect) => {
      let applies: CampaignFactValue = "TRUE";

      if (effect.condition) {
        const outcome = evaluatePredicateExpression(effect.condition, {
          ...fullContext,
          ...(actor.characterLevel !== undefined ? { actorLevel: actor.characterLevel } : {}),
          ...(actor.abilities ? { abilities: actor.abilities as Record<string, number> } : {}),
          ...(actor.proficiencies ? { proficiencies: new Set(actor.proficiencies) } : {}),
          ...(actor.ownedAssetIds ? { ownedAssetIds: new Set(actor.ownedAssetIds) } : {}),
          ...(actor.tags ? { tags: new Set(actor.tags) } : {}),
          ...(actor.facts ? { facts: actor.facts } : {}),
        });

        reasons.push(...outcome.reasons);
        applies = outcome.outcome;
      }

      const resolved = resolveEffectPayload(effect.payload, fullContext);

      reasons.push(...resolved.reasons);

      return {
        key: effect.key,
        activationKey: effect.activationKey,
        effectType: resolved.payload.type,
        applies,
        payload: resolved.payload,
      };
    });

  return {
    resolved: true,
    parameters,
    choices,
    scaling,
    resources,
    activations,
    effects,
    reasons: [...new Set(reasons)],
  };
}

// ---------------------------------------------------------------------------
// Several features of one actor
// ---------------------------------------------------------------------------

export type FeatureInstance = {
  assetId: string;
  stackingMode: FeatureStackingMode;
  supersedes: FeatureGraph["supersedes"];
  resolved: ResolvedFeatureGraph;
};

export type InstanceStatus = "APPLIED" | "REPLACED" | "UPGRADED" | "DUPLICATE";

export type EvaluatedEffects = {
  instances: { index: number; assetId: string; status: InstanceStatus }[];
  /** Effects of applied instances, in instance order. */
  effects: (ResolvedFeatureGraph["effects"][number] & { index: number; assetId: string })[];
  /** Passive effects whose condition holds, added up. */
  totals: {
    modifiers: Record<string, number>;
    baseValues: Record<string, number>;
    grants: { grantType: string; value: string }[];
    advantages: { mode: "ADVANTAGE" | "DISADVANTAGE"; on: string }[];
  };
};

function effectSize(payload: ResolvedEffectPayload): number {
  switch (payload.type) {
    case "MODIFIER":
    case "RESOURCE":
      return payload.amount ?? Number.NEGATIVE_INFINITY;
    case "BASE_VALUE":
      return payload.value ?? Number.NEGATIVE_INFINITY;
    case "MOVEMENT":
      return payload.distance ?? Number.NEGATIVE_INFINITY;
    case "DAMAGE":
    case "HEAL": {
      const dice = payload.dice?.count ? (payload.dice.count * (payload.dice.faces + 1)) / 2 : 0;

      return dice + (payload.amount ?? 0);
    }
    default:
      return 0;
  }
}

/**
 * Combines the features of one actor: a feature that replaces another drops it, one that upgrades
 * another drops its effects but keeps its choices and resources. Repeated grants of one feature
 * follow its stacking mode: `NONE` keeps the first, `REPLACE` the last, `STACK` all of them and
 * `HIGHEST` the strongest version of each effect. Pure; changes no actor state.
 */
export function evaluateFeatureEffects(instances: readonly FeatureInstance[]): EvaluatedEffects {
  const present = new Set(instances.map((instance) => instance.assetId));
  const superseded = new Map<string, "REPLACED" | "UPGRADED">();

  for (const instance of instances) {
    for (const target of instance.supersedes) {
      if (target.targetAssetId !== instance.assetId && present.has(target.targetAssetId)) {
        const current = superseded.get(target.targetAssetId);

        // Replacing is the stronger of the two.
        if (current !== "REPLACED") {
          superseded.set(target.targetAssetId, target.mode === "REPLACE" ? "REPLACED" : "UPGRADED");
        }
      }
    }
  }

  const byAsset = new Map<string, number[]>();

  instances.forEach((instance, index) => {
    byAsset.set(instance.assetId, [...(byAsset.get(instance.assetId) ?? []), index]);
  });

  const statuses = instances.map((instance, index): InstanceStatus => {
    const supersededAs = superseded.get(instance.assetId);

    if (supersededAs) {
      return supersededAs;
    }

    const indexes = byAsset.get(instance.assetId) ?? [index];

    if (instance.stackingMode === "NONE" && indexes[0] !== index) {
      return "DUPLICATE";
    }

    if (instance.stackingMode === "REPLACE" && indexes.at(-1) !== index) {
      return "DUPLICATE";
    }

    return "APPLIED";
  });

  const effects: EvaluatedEffects["effects"] = [];
  const strongest = new Map<string, number>();

  instances.forEach((instance, index) => {
    if (statuses[index] !== "APPLIED") {
      return;
    }

    for (const effect of instance.resolved.effects) {
      if (instance.stackingMode === "HIGHEST") {
        const slot = `${instance.assetId}:${effect.key}`;
        const previous = strongest.get(slot);

        if (previous !== undefined) {
          const kept = effects[previous];

          if (kept && effectSize(kept.payload) >= effectSize(effect.payload)) {
            continue;
          }

          effects.splice(previous, 1, { ...effect, index, assetId: instance.assetId });
          continue;
        }

        strongest.set(slot, effects.length);
      }

      effects.push({ ...effect, index, assetId: instance.assetId });
    }
  });

  const totals: EvaluatedEffects["totals"] = {
    modifiers: {},
    baseValues: {},
    grants: [],
    advantages: [],
  };
  const grantKeys = new Set<string>();

  for (const effect of effects) {
    if (effect.activationKey !== null || effect.applies !== "TRUE") {
      continue;
    }

    const { payload } = effect;

    if (payload.type === "MODIFIER" && payload.amount !== null) {
      totals.modifiers[payload.stat] = (totals.modifiers[payload.stat] ?? 0) + payload.amount;
    } else if (payload.type === "BASE_VALUE" && payload.value !== null) {
      totals.baseValues[payload.stat] = Math.max(
        totals.baseValues[payload.stat] ?? Number.NEGATIVE_INFINITY,
        payload.value,
      );
    } else if (payload.type === "GRANT") {
      const key = `${payload.grantType}:${payload.value}`;

      if (!grantKeys.has(key)) {
        grantKeys.add(key);
        totals.grants.push({ grantType: payload.grantType, value: payload.value });
      }
    } else if (payload.type === "ADVANTAGE") {
      totals.advantages.push({ mode: payload.mode, on: payload.on });
    }
  }

  return {
    instances: instances.map((instance, index) => ({
      index,
      assetId: instance.assetId,
      status: statuses[index] as InstanceStatus,
    })),
    effects,
    totals,
  };
}
