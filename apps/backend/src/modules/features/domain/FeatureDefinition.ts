import type { PredicateExpression, ValueExpression } from "#core/rules/contracts";
import { listPayloadDiceRefs, listPayloadExpressions } from "#core/rules/contracts";
import { assertExpressionLimits, collectVariableKeys } from "#core/rules/evaluator";
import type {
  FeatureGraph,
  ParameterValueType,
  ScalingValueType,
} from "#src/modules/features/domain/dto/FeatureDefinitionDto";

export type DefinitionIssue = { path: (string | number)[]; message: string };

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

const ABILITY_SCORE_STATS = new Set<string>(ABILITIES.map((ability) => `ability.${ability}`));

/**
 * Whether the effects raise or set an ability score: `MODIFIER` or `BASE_VALUE` on `ability.str`
 * …, compared without case and surrounding spaces because `stat` is free text. The derived
 * modifier (`ability.str.modifier`) does not count, and neither does a modifier with a constant
 * amount of zero or less (a penalty). Amounts that are computed may be positive, so they count.
 */
export function raisesAbilityScore(graph: Pick<FeatureGraph, "effects">): boolean {
  return graph.effects.some(({ payload }) => {
    if (payload.type !== "MODIFIER" && payload.type !== "BASE_VALUE") {
      return false;
    }

    if (!ABILITY_SCORE_STATS.has(payload.stat.trim().toLowerCase())) {
      return false;
    }

    return !(payload.type === "MODIFIER" && payload.amount.type === "CONST" && payload.amount.value <= 0);
  });
}

/**
 * Whether the definition depends on the level of a class: a scaling track by `CLASS_LEVEL` or an
 * expression with `level.class`. Sources without a class level (species, feats) cannot resolve such
 * a feature.
 */
export function usesClassLevel(graph: FeatureGraph): boolean {
  if (graph.scalingTracks.some((track) => track.scaleBy === "CLASS_LEVEL")) {
    return true;
  }

  const values: ValueExpression[] = [
    ...graph.resources.map((resource) => resource.maximumExpression),
    ...graph.activations.flatMap((activation) => [
      ...(activation.duration?.amount ? [activation.duration.amount] : []),
      ...activation.costs.map((cost) => cost.amountExpression),
    ]),
    ...graph.effects.flatMap((effect) => listPayloadExpressions(effect.payload)),
  ];
  const expressions = [
    ...values.map((root) => ({ kind: "value" as const, root })),
    ...graph.effects.flatMap((effect) =>
      effect.condition ? [{ kind: "predicate" as const, root: effect.condition }] : [],
    ),
  ];

  return expressions.some((expression) => collectVariableKeys(expression).has("level.class"));
}

/** Values every resolution may provide; missing ones make results unknown, not invalid. */
export const CONTEXT_VALUE_KEYS: readonly string[] = [
  "level.character",
  "level.class",
  "level.source",
  "proficiencyBonus",
  ...ABILITIES.flatMap((ability) => [`ability.${ability}`, `ability.${ability}.modifier`]),
];

const NUMERIC_PARAMETER_TYPES: readonly ParameterValueType[] = [
  "INTEGER",
  "DECIMAL",
  "BOOLEAN",
  "DISTANCE",
];
const NUMERIC_SCALING_TYPES: readonly ScalingValueType[] = ["INTEGER", "DECIMAL", "DISTANCE"];

export const parameterVariable = (key: string) => `param.${key}`;
export const scalingVariable = (key: string) => `scale.${key}`;
export const resourceVariable = (key: string) => `resource.${key}.max`;

/** Variables and dice an expression of this feature may use. */
export type FeatureVocabulary = {
  /** For resource maximums, which cannot refer to resources. */
  baseValueKeys: Set<string>;
  /** For activations and effects. */
  valueKeys: Set<string>;
  diceKeys: Set<string>;
};

export function buildVocabulary(graph: Pick<FeatureGraph, "parameters" | "scalingTracks" | "resources">): FeatureVocabulary {
  const baseValueKeys = new Set(CONTEXT_VALUE_KEYS);
  const diceKeys = new Set<string>();

  for (const parameter of graph.parameters) {
    if (NUMERIC_PARAMETER_TYPES.includes(parameter.valueType)) {
      baseValueKeys.add(parameterVariable(parameter.key));
    } else if (parameter.valueType === "DIE") {
      diceKeys.add(parameterVariable(parameter.key));
    }
  }

  for (const track of graph.scalingTracks) {
    if (NUMERIC_SCALING_TYPES.includes(track.valueType)) {
      baseValueKeys.add(scalingVariable(track.key));
    } else if (track.valueType === "DIE") {
      diceKeys.add(scalingVariable(track.key));
    }
  }

  const valueKeys = new Set(baseValueKeys);

  for (const resource of graph.resources) {
    valueKeys.add(resourceVariable(resource.key));
  }

  return { baseValueKeys, valueKeys, diceKeys };
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

/**
 * Rules across the parts of a definition that need no database: unique keys per part, references
 * between parts, only allowed variables, and the size limits of every expression. The schemas have
 * already checked each part on its own. Returns all issues instead of stopping at the first.
 */
export function validateFeatureDefinition(graph: FeatureGraph): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const vocabulary = buildVocabulary(graph);

  const checkUnique = (part: keyof FeatureGraph, keys: readonly string[], label: string) => {
    const repeated = duplicates(keys);

    keys.forEach((key, index) => {
      if (repeated.has(key)) {
        issues.push({ path: [part, index, "key"], message: `${label} keys must be unique` });
      }
    });
  };

  checkUnique("sections", graph.sections.map((item) => item.key), "Section");
  checkUnique("parameters", graph.parameters.map((item) => item.key), "Parameter");
  checkUnique("choices", graph.choices.map((item) => item.key), "Choice");
  checkUnique("resources", graph.resources.map((item) => item.key), "Resource");
  checkUnique("scalingTracks", graph.scalingTracks.map((item) => item.key), "Scaling track");
  checkUnique("activations", graph.activations.map((item) => item.key), "Activation");
  checkUnique("effects", graph.effects.map((item) => item.key), "Effect");

  const targets = duplicates(graph.supersedes.map((item) => item.targetAssetId));

  graph.supersedes.forEach((item, index) => {
    if (targets.has(item.targetAssetId)) {
      issues.push({ path: ["supersedes", index, "targetAssetId"], message: "Targets must be unique" });
    }
  });

  const checkValue = (
    path: (string | number)[],
    expression: ValueExpression,
    allowed: ReadonlySet<string>,
  ) => checkExpression(issues, path, { kind: "value", root: expression }, allowed);

  graph.resources.forEach((resource, index) =>
    checkValue(["resources", index, "maximumExpression"], resource.maximumExpression, vocabulary.baseValueKeys),
  );

  const resourceKeys = new Set(graph.resources.map((resource) => resource.key));
  const activationKeys = new Set(graph.activations.map((activation) => activation.key));

  graph.activations.forEach((activation, index) => {
    if (activation.duration?.amount) {
      checkValue(["activations", index, "duration", "amount"], activation.duration.amount, vocabulary.valueKeys);
    }

    activation.costs.forEach((cost, costIndex) => {
      const path = ["activations", index, "costs", costIndex];

      if (cost.resourceKey !== null && !resourceKeys.has(cost.resourceKey)) {
        issues.push({ path: [...path, "resourceKey"], message: "Unknown resource" });
      }

      checkValue([...path, "amountExpression"], cost.amountExpression, vocabulary.valueKeys);
    });
  });

  graph.effects.forEach((effect, index) => {
    const path = ["effects", index];

    if (effect.activationKey !== null && !activationKeys.has(effect.activationKey)) {
      issues.push({ path: [...path, "activationKey"], message: "Unknown activation" });
    }

    if (effect.condition) {
      checkExpression(
        issues,
        [...path, "condition"],
        { kind: "predicate", root: effect.condition },
        vocabulary.valueKeys,
      );
    }

    for (const expression of listPayloadExpressions(effect.payload)) {
      checkValue([...path, "payload"], expression, vocabulary.valueKeys);
    }

    for (const ref of listPayloadDiceRefs(effect.payload)) {
      if (!vocabulary.diceKeys.has(ref)) {
        issues.push({ path: [...path, "payload", "dice", "ref"], message: `Unknown dice '${ref}'` });
      }
    }
  });

  return issues;
}

function checkExpression(
  issues: DefinitionIssue[],
  path: (string | number)[],
  expression:
    | { kind: "value"; root: ValueExpression }
    | { kind: "predicate"; root: PredicateExpression },
  allowed: ReadonlySet<string>,
): void {
  try {
    assertExpressionLimits(expression);
  } catch (error) {
    issues.push({ path, message: (error as Error).message });
    return;
  }

  for (const key of collectVariableKeys(expression)) {
    if (!allowed.has(key)) {
      issues.push({ path, message: `Unknown variable '${key}'` });
    }
  }
}

/** Assets the definition refers to, with where; checked against the database by the service. */
export type AssetReference = {
  assetId: string;
  path: (string | number)[];
  kind: "SUPERSEDES" | "CHOICE_OPTION" | "PARAMETER_DEFAULT";
};

export function collectAssetReferences(
  graph: Pick<FeatureGraph, "supersedes" | "choices" | "parameters">,
): AssetReference[] {
  const references: AssetReference[] = [];

  graph.supersedes.forEach((item, index) =>
    references.push({
      assetId: item.targetAssetId,
      path: ["supersedes", index, "targetAssetId"],
      kind: "SUPERSEDES",
    }),
  );
  graph.choices.forEach((choice, index) =>
    choice.options.forEach((option, optionIndex) => {
      if (option.linkedAssetId) {
        references.push({
          assetId: option.linkedAssetId,
          path: ["choices", index, "options", optionIndex, "linkedAssetId"],
          kind: "CHOICE_OPTION",
        });
      }
    }),
  );
  graph.parameters.forEach((parameter, index) => {
    if (parameter.valueType === "ASSET_REF" && typeof parameter.defaultValue === "string") {
      references.push({
        assetId: parameter.defaultValue,
        path: ["parameters", index, "defaultValue"],
        kind: "PARAMETER_DEFAULT",
      });
    }
  });

  return references;
}
