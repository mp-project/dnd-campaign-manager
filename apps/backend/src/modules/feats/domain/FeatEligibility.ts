import type {
  FeatChoice,
  FeatDefinition,
  PrerequisiteNode,
  PrerequisiteNodeType,
} from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import type {
  AcquisitionContext,
  FeatActorSnapshot,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import type { FeatCategory } from "#src/modules/feats/domain/FeatDefinition";

/** Three-valued result: a prerequisite whose facts are missing is neither met nor failed. */
export type Truth = "TRUE" | "FALSE" | "UNKNOWN";

export type EligibilityReasonCode =
  | "PREREQUISITE"
  | "MINIMUM_LEVEL"
  | "CATEGORY"
  | "REPEATABILITY"
  | "STATUS";

export type EligibilityReason = {
  code: EligibilityReasonCode;
  nodeType: PrerequisiteNodeType | null;
  path: (string | number)[];
  message: string;
  /** The asset a failed node names; null when there is none or the viewer may not see it. */
  assetId: string | null;
};

export type AllowedChoice = Pick<
  FeatChoice,
  | "key"
  | "label"
  | "choiceType"
  | "minimumSelections"
  | "maximumSelections"
  | "dependsOnChoiceKey"
  | "optionFilter"
  | "options"
> & {
  /** Option codes or asset ids the character already took for this feat and may not take again. */
  excludedValues: string[];
};

export type EligibilityResult = {
  outcome: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN";
  eligible: boolean;
  reasons: EligibilityReason[];
  unknownFacts: string[];
  allowedChoices: AllowedChoice[];
};

export type EligibilityFeat = {
  assetId: string;
  category: FeatCategory;
  minimumCharacterLevel: number | null;
  definition: FeatDefinition;
};

type NodeResult = { truth: Truth; reasons: EligibilityReason[]; unknown: string[] };

const ABILITY_NAMES: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

function leaf(
  truth: Truth,
  node: PrerequisiteNode,
  path: (string | number)[],
  message: string,
  unknownFact: string,
): NodeResult {
  const assetId = "assetId" in node ? node.assetId : null;

  return {
    truth,
    reasons:
      truth === "FALSE"
        ? [{ code: "PREREQUISITE", nodeType: node.type, path, message, assetId }]
        : [],
    unknown: truth === "UNKNOWN" ? [unknownFact] : [],
  };
}

const truthOf = (value: boolean | undefined): Truth =>
  value === undefined ? "UNKNOWN" : value ? "TRUE" : "FALSE";

/** What the node says, as text, for negated nodes and messages. */
function describe(node: PrerequisiteNode): string {
  switch (node.type) {
    case "ABILITY_MIN":
      return `${ABILITY_NAMES[node.ability] ?? node.ability} ${node.minimum} or higher`;
    case "PROFICIENCY":
      return `proficiency '${node.proficiency}'`;
    case "CLASS":
      return node.minimumLevel ? `level ${node.minimumLevel} in the class` : "a level in the class";
    case "SPECIES":
      return "the species";
    case "FEAT":
      return "the feat";
    case "SPELLCASTING":
      return "the ability to cast at least one spell";
    case "LEVEL":
      return `character level ${node.minimumCharacterLevel}`;
    case "CUSTOM":
      return node.description;
    case "NOT":
      return `not ${describe(node.child)}`;
    default:
      return node.type === "ALL" ? "all of the conditions" : "one of the conditions";
  }
}

/** Evaluates a prerequisite node against the snapshot. */
export function evaluatePrerequisite(
  node: PrerequisiteNode,
  actor: FeatActorSnapshot,
  path: (string | number)[] = ["prerequisites"],
): NodeResult {
  switch (node.type) {
    case "ALL":
    case "ANY": {
      const results = node.children.map((child, index) =>
        evaluatePrerequisite(child, actor, [...path, "children", index]),
      );
      const decisive = node.type === "ALL" ? "FALSE" : "TRUE";
      const truth: Truth = results.some((result) => result.truth === decisive)
        ? decisive
        : results.some((result) => result.truth === "UNKNOWN")
          ? "UNKNOWN"
          : decisive === "FALSE"
            ? "TRUE"
            : "FALSE";

      return {
        truth,
        reasons: truth === "FALSE" ? results.flatMap((result) => result.reasons) : [],
        unknown: truth === "UNKNOWN" ? results.flatMap((result) => result.unknown) : [],
      };
    }
    case "NOT": {
      const inner = evaluatePrerequisite(node.child, actor, [...path, "child"]);
      const truth: Truth =
        inner.truth === "UNKNOWN" ? "UNKNOWN" : inner.truth === "TRUE" ? "FALSE" : "TRUE";

      return {
        truth,
        reasons:
          truth === "FALSE"
            ? [
                {
                  code: "PREREQUISITE",
                  nodeType: "NOT",
                  path,
                  message: `Requires ${describe(node)}`,
                  assetId: "assetId" in node.child ? node.child.assetId : null,
                },
              ]
            : [],
        unknown: inner.unknown,
      };
    }
    case "ABILITY_MIN": {
      const score = actor.abilities?.[node.ability];

      return leaf(
        truthOf(score === undefined ? undefined : score >= node.minimum),
        node,
        path,
        `Requires ${describe(node)}`,
        `abilities.${node.ability}`,
      );
    }
    case "PROFICIENCY":
      return leaf(
        truthOf(actor.proficiencies?.includes(node.proficiency)),
        node,
        path,
        `Requires ${describe(node)}`,
        "proficiencies",
      );
    case "CLASS":
      return leaf(
        truthOf(
          actor.classes?.some(
            (entry) => entry.classAssetId === node.assetId && entry.level >= (node.minimumLevel ?? 1),
          ),
        ),
        node,
        path,
        `Requires ${describe(node)}`,
        "classes",
      );
    case "SPECIES":
      return leaf(
        truthOf(actor.speciesAssetIds?.includes(node.assetId)),
        node,
        path,
        `Requires ${describe(node)}`,
        "speciesAssetIds",
      );
    case "FEAT":
      return leaf(
        truthOf(actor.feats?.some((entry) => entry.featAssetId === node.assetId)),
        node,
        path,
        `Requires ${describe(node)}`,
        "feats",
      );
    case "SPELLCASTING":
      return leaf(truthOf(actor.spellcasting), node, path, `Requires ${describe(node)}`, "spellcasting");
    case "LEVEL":
      return leaf(
        truthOf(
          actor.characterLevel === undefined
            ? undefined
            : actor.characterLevel >= node.minimumCharacterLevel,
        ),
        node,
        path,
        `Requires ${describe(node)}`,
        "characterLevel",
      );
    case "CUSTOM":
      return leaf(
        truthOf(actor.facts?.[node.key]),
        node,
        path,
        `Requires: ${node.description}`,
        `facts.${node.key}`,
      );
  }
}

/** Answers of earlier occurrences of the feat to the choice that tells them apart. */
function takenValues(feat: EligibilityFeat, actor: FeatActorSnapshot): string[] {
  const key = feat.definition.repeatability.repeatabilityChoiceKey;

  if (key === null) {
    return [];
  }

  return (actor.feats ?? [])
    .filter((entry) => entry.featAssetId === feat.assetId)
    .flatMap((entry) => entry.choices[key] ?? []);
}

/**
 * Whether a character may take the feat now: its prerequisites, the minimum level, the category
 * the slot accepts and how often it may be taken. Missing facts make the result `UNKNOWN` and are
 * listed in `unknownFacts`; a failed rule makes it `INELIGIBLE` regardless of unknown ones.
 * `allowedChoices` are the feat's choices without answers that earlier occurrences already took.
 * The caller passes the definition as the viewer may see it (choices without hidden options).
 */
export function evaluateFeatEligibility(
  feat: EligibilityFeat,
  snapshot: FeatActorSnapshot,
  context: AcquisitionContext,
): EligibilityResult {
  const actor: FeatActorSnapshot = {
    ...snapshot,
    ...(context.characterLevel !== undefined ? { characterLevel: context.characterLevel } : {}),
  };
  const reasons: EligibilityReason[] = [];
  const unknown: string[] = [];
  const truths: Truth[] = [];

  if (feat.definition.prerequisites) {
    const result = evaluatePrerequisite(feat.definition.prerequisites, actor);

    truths.push(result.truth);
    reasons.push(...result.reasons);
    unknown.push(...result.unknown);
  }

  if (feat.minimumCharacterLevel !== null) {
    if (actor.characterLevel === undefined) {
      truths.push("UNKNOWN");
      unknown.push("characterLevel");
    } else if (actor.characterLevel < feat.minimumCharacterLevel) {
      truths.push("FALSE");
      reasons.push({
        code: "MINIMUM_LEVEL",
        nodeType: null,
        path: ["minimumCharacterLevel"],
        message: `Requires character level ${feat.minimumCharacterLevel}`,
        assetId: null,
      });
    }
  }

  if (context.allowedCategories && !context.allowedCategories.includes(feat.category)) {
    truths.push("FALSE");
    reasons.push({
      code: "CATEGORY",
      nodeType: null,
      path: ["category"],
      message: `The slot accepts ${context.allowedCategories.join(", ")} feats, not ${feat.category}`,
      assetId: null,
    });
  }

  const { repeatability } = feat.definition;
  const taken = takenValues(feat, actor);
  const allowedChoices: AllowedChoice[] = feat.definition.choices.map((choice) => {
    const excludedValues = choice.key === repeatability.repeatabilityChoiceKey ? [...new Set(taken)] : [];

    return {
      key: choice.key,
      label: choice.label,
      choiceType: choice.choiceType,
      minimumSelections: choice.minimumSelections,
      maximumSelections: choice.maximumSelections,
      dependsOnChoiceKey: choice.dependsOnChoiceKey,
      optionFilter: choice.optionFilter,
      options: choice.options.filter(
        (option) =>
          !excludedValues.includes(option.code) &&
          (option.linkedAssetId === null || !excludedValues.includes(option.linkedAssetId)),
      ),
      excludedValues,
    };
  });

  if (actor.feats === undefined) {
    if (repeatability.mode !== "UNLIMITED") {
      truths.push("UNKNOWN");
      unknown.push("feats");
    }
  } else {
    const occurrences = actor.feats.filter((entry) => entry.featAssetId === feat.assetId).length;
    const exhausted = (message: string) => {
      truths.push("FALSE");
      reasons.push({
        code: "REPEATABILITY",
        nodeType: null,
        path: ["repeatability"],
        message,
        assetId: null,
      });
    };

    if (repeatability.mode === "ONCE" && occurrences > 0) {
      exhausted("The feat can only be taken once");
    } else if (
      repeatability.mode === "LIMITED" &&
      occurrences >= (repeatability.maximumOccurrences ?? 1)
    ) {
      exhausted(`The feat can be taken at most ${repeatability.maximumOccurrences} times`);
    } else if (repeatability.mode === "DISTINCT_BY_CHOICE" && occurrences > 0) {
      const choice = allowedChoices.find((item) => item.key === repeatability.repeatabilityChoiceKey);

      if (choice && choice.optionFilter === null && choice.options.length < choice.minimumSelections) {
        exhausted("Every option of the choice that tells occurrences apart is already taken");
      }
    }
  }

  const outcome = truths.includes("FALSE")
    ? "INELIGIBLE"
    : truths.includes("UNKNOWN")
      ? "UNKNOWN"
      : "ELIGIBLE";

  return {
    outcome,
    eligible: outcome === "ELIGIBLE",
    reasons: outcome === "INELIGIBLE" ? reasons : [],
    unknownFacts: outcome === "UNKNOWN" ? [...new Set(unknown)].sort() : [],
    allowedChoices,
  };
}

/**
 * Issues of answers to the feat's choices: unknown keys, too few or too many values, values that
 * are no option, answers to a choice whose dependency is unanswered, and for repeatable feats an
 * answer an earlier occurrence already took. Filtered choices take asset ids, which the service
 * checks against the catalog.
 */
export function validateFeatChoices(
  choices: readonly FeatChoice[],
  answers: Readonly<Record<string, readonly string[]>>,
  excluded: Readonly<Record<string, readonly string[]>> = {},
): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const byKey = new Map(choices.map((choice) => [choice.key, choice]));

  for (const key of Object.keys(answers)) {
    if (!byKey.has(key)) {
      issues.push({ path: ["choices", key], message: `Unknown choice '${key}'` });
    }
  }

  for (const choice of choices) {
    const values = answers[choice.key] ?? [];
    const path = ["choices", choice.key];

    if (new Set(values).size !== values.length) {
      issues.push({ path, message: "Each value can be chosen once" });
    }

    if (values.length < choice.minimumSelections || values.length > choice.maximumSelections) {
      issues.push({
        path,
        message: `Choose between ${choice.minimumSelections} and ${choice.maximumSelections} values`,
      });
    }

    if (
      values.length > 0 &&
      choice.dependsOnChoiceKey !== null &&
      (answers[choice.dependsOnChoiceKey] ?? []).length === 0
    ) {
      issues.push({ path, message: `Answer '${choice.dependsOnChoiceKey}' first` });
    }

    if (choice.optionFilter === null) {
      const codes = new Set(choice.options.map((option) => option.code));

      for (const value of values) {
        if (!codes.has(value)) {
          issues.push({ path, message: `'${value}' is no option of the choice` });
        }
      }
    }

    for (const value of values) {
      if ((excluded[choice.key] ?? []).includes(value)) {
        issues.push({ path, message: `'${value}' was already taken with an earlier occurrence` });
      }
    }
  }

  return issues;
}
