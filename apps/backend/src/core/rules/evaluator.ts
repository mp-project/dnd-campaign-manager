import type { CampaignFactValue } from "#core/rules/campaignFacts";
import type {
  DiceFormula,
  DieFaces,
  EffectPayload,
  PredicateExpression,
  ValueExpression,
} from "#core/rules/contracts";

export type RuleEvaluationOptions = {
  maxDepth?: number;
  maxNodes?: number;
};

export const DEFAULT_RULE_MAX_DEPTH = 12;
export const DEFAULT_RULE_MAX_NODES = 256;

export type ValueEvaluationContext = {
  values: Record<string, number>;
  allowedValueKeys: ReadonlySet<string>;
  /** Dice that payloads refer to by key, such as a die that grows with level. */
  dice?: Record<string, { count: number; faces: DieFaces }>;
};

export type PredicateEvaluationContext = {
  values: Record<string, number>;
  allowedValueKeys: ReadonlySet<string>;
  actorLevel?: number;
  abilities?: Record<string, number>;
  proficiencies?: ReadonlySet<string>;
  ownedAssetIds?: ReadonlySet<string>;
  tags?: ReadonlySet<string>;
  facts?: Record<string, CampaignFactValue>;
};

export type ValueEvaluationResult = {
  value: number | null;
  trace: string[];
  reasons: string[];
};

export type PredicateEvaluationResult = {
  outcome: CampaignFactValue;
  trace: string[];
  reasons: string[];
};

function enforceNodeAndDepthLimits(
  input: (
    | { kind: "value"; root: ValueExpression }
    | { kind: "predicate"; root: PredicateExpression }
  ) & {
    maxDepth: number;
    maxNodes: number;
  },
): void {
  let nodes = 0;

  const visitValue = (expression: ValueExpression, depth: number): void => {
    if (depth > input.maxDepth) {
      throw new Error(`Expression depth limit exceeded (${input.maxDepth})`);
    }

    nodes += 1;

    if (nodes > input.maxNodes) {
      throw new Error(`Expression node limit exceeded (${input.maxNodes})`);
    }

    if (expression.type === "CONST" || expression.type === "VAR") {
      return;
    }

    for (const arg of expression.args) {
      visitValue(arg, depth + 1);
    }
  };

  const visitPredicate = (expression: PredicateExpression, depth: number): void => {
    if (depth > input.maxDepth) {
      throw new Error(`Expression depth limit exceeded (${input.maxDepth})`);
    }

    nodes += 1;

    if (nodes > input.maxNodes) {
      throw new Error(`Expression node limit exceeded (${input.maxNodes})`);
    }

    if (expression.type === "ALL" || expression.type === "ANY") {
      for (const condition of expression.conditions) {
        visitPredicate(condition, depth + 1);
      }
      return;
    }

    if (expression.type === "NOT") {
      visitPredicate(expression.condition, depth + 1);
      return;
    }

    if (expression.type === "COMPARE") {
      visitValue(expression.left, depth + 1);
      visitValue(expression.right, depth + 1);
    }
  };

  if (input.kind === "predicate") {
    visitPredicate(input.root as PredicateExpression, 1);
    return;
  }

  visitValue(input.root as ValueExpression, 1);
}

/**
 * Rejects expressions that are too deep or too large, before they are stored or evaluated. Throws
 * a plain Error; callers that validate input turn it into a validation error.
 */
export function assertExpressionLimits(
  expression:
    | { kind: "value"; root: ValueExpression }
    | { kind: "predicate"; root: PredicateExpression },
  options: RuleEvaluationOptions = {},
): void {
  enforceNodeAndDepthLimits({
    ...expression,
    maxDepth: options.maxDepth ?? DEFAULT_RULE_MAX_DEPTH,
    maxNodes: options.maxNodes ?? DEFAULT_RULE_MAX_NODES,
  });
}

/** Keys of all `VAR` nodes, so callers can check them against the keys they allow. */
export function collectVariableKeys(
  expression:
    | { kind: "value"; root: ValueExpression }
    | { kind: "predicate"; root: PredicateExpression },
): Set<string> {
  const keys = new Set<string>();

  const visitValue = (node: ValueExpression): void => {
    if (node.type === "VAR") {
      keys.add(node.key);
    } else if (node.type !== "CONST") {
      node.args.forEach(visitValue);
    }
  };

  const visitPredicate = (node: PredicateExpression): void => {
    if (node.type === "ALL" || node.type === "ANY") {
      node.conditions.forEach(visitPredicate);
    } else if (node.type === "NOT") {
      visitPredicate(node.condition);
    } else if (node.type === "COMPARE") {
      visitValue(node.left);
      visitValue(node.right);
    }
  };

  if (expression.kind === "predicate") {
    visitPredicate(expression.root);
  } else {
    visitValue(expression.root);
  }

  return keys;
}

function compareNumbers(operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE", left: number, right: number): boolean {
  switch (operator) {
    case "EQ":
      return left === right;
    case "NEQ":
      return left !== right;
    case "GT":
      return left > right;
    case "GTE":
      return left >= right;
    case "LT":
      return left < right;
    case "LTE":
      return left <= right;
  }
}

export function evaluateValueExpression(
  expression: ValueExpression,
  context: ValueEvaluationContext,
  options: RuleEvaluationOptions = {},
): ValueEvaluationResult {
  assertExpressionLimits({ kind: "value", root: expression }, options);

  const trace: string[] = [];
  const reasons: string[] = [];

  const evaluate = (node: ValueExpression): number | null => {
    if (node.type === "CONST") {
      trace.push(`CONST(${node.value})`);
      return node.value;
    }

    if (node.type === "VAR") {
      if (!context.allowedValueKeys.has(node.key)) {
        reasons.push(`Unknown variable key '${node.key}'`);
        trace.push(`VAR(${node.key})=UNKNOWN`);
        return null;
      }

      const value = context.values[node.key];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        reasons.push(`Missing variable value '${node.key}'`);
        trace.push(`VAR(${node.key})=UNKNOWN`);
        return null;
      }

      trace.push(`VAR(${node.key})=${value}`);
      return value;
    }

    const argValues = node.args.map((arg) => evaluate(arg));

    if (argValues.some((value) => value === null)) {
      trace.push(`${node.type}(...)=UNKNOWN`);
      return null;
    }

    const values = argValues as number[];

    switch (node.type) {
      case "ADD": {
        const value = values.reduce((sum, current) => sum + current, 0);
        trace.push(`ADD=${value}`);
        return value;
      }
      case "SUBTRACT": {
        const [first, ...rest] = values;
        const value = rest.reduce((sum, current) => sum - current, first ?? 0);
        trace.push(`SUBTRACT=${value}`);
        return value;
      }
      case "MULTIPLY": {
        const value = values.reduce((product, current) => product * current, 1);
        trace.push(`MULTIPLY=${value}`);
        return value;
      }
      case "DIVIDE": {
        const [first, ...rest] = values;

        if (rest.some((value) => value === 0)) {
          reasons.push("Division by zero");
          trace.push("DIVIDE=UNKNOWN");
          return null;
        }

        const value = rest.reduce((result, divisor) => result / divisor, first ?? 0);
        trace.push(`DIVIDE=${value}`);
        return value;
      }
      case "MIN": {
        const value = Math.min(...values);
        trace.push(`MIN=${value}`);
        return value;
      }
      case "MAX": {
        const value = Math.max(...values);
        trace.push(`MAX=${value}`);
        return value;
      }
      case "FLOOR": {
        const value = Math.floor(values[0] ?? 0);
        trace.push(`FLOOR=${value}`);
        return value;
      }
      case "CEIL": {
        const value = Math.ceil(values[0] ?? 0);
        trace.push(`CEIL=${value}`);
        return value;
      }
    }
  };

  const value = evaluate(expression);

  return {
    value,
    trace,
    reasons,
  };
}

export function evaluatePredicateExpression(
  expression: PredicateExpression,
  context: PredicateEvaluationContext,
  options: RuleEvaluationOptions = {},
): PredicateEvaluationResult {
  assertExpressionLimits({ kind: "predicate", root: expression }, options);

  const trace: string[] = [];
  const reasons: string[] = [];

  const evaluate = (node: PredicateExpression): CampaignFactValue => {
    if (node.type === "ALL") {
      let hasUnknown = false;

      for (const condition of node.conditions) {
        const outcome = evaluate(condition);

        if (outcome === "FALSE") {
          trace.push("ALL=FALSE");
          return "FALSE";
        }

        if (outcome === "UNKNOWN") {
          hasUnknown = true;
        }
      }

      const result: CampaignFactValue = hasUnknown ? "UNKNOWN" : "TRUE";
      trace.push(`ALL=${result}`);
      return result;
    }

    if (node.type === "ANY") {
      let hasUnknown = false;

      for (const condition of node.conditions) {
        const outcome = evaluate(condition);

        if (outcome === "TRUE") {
          trace.push("ANY=TRUE");
          return "TRUE";
        }

        if (outcome === "UNKNOWN") {
          hasUnknown = true;
        }
      }

      const result: CampaignFactValue = hasUnknown ? "UNKNOWN" : "FALSE";
      trace.push(`ANY=${result}`);
      return result;
    }

    if (node.type === "NOT") {
      const outcome = evaluate(node.condition);

      if (outcome === "UNKNOWN") {
        trace.push("NOT=UNKNOWN");
        return "UNKNOWN";
      }

      const result: CampaignFactValue = outcome === "TRUE" ? "FALSE" : "TRUE";
      trace.push(`NOT=${result}`);
      return result;
    }

    if (node.type === "COMPARE") {
      const left = evaluateValueExpression(node.left, context, options);
      const right = evaluateValueExpression(node.right, context, options);

      trace.push(...left.trace, ...right.trace);
      reasons.push(...left.reasons, ...right.reasons);

      if (left.value === null || right.value === null) {
        trace.push("COMPARE=UNKNOWN");
        return "UNKNOWN";
      }

      const result = compareNumbers(node.operator, left.value, right.value)
        ? "TRUE"
        : "FALSE";

      trace.push(`COMPARE=${result}`);
      return result;
    }

    if (node.type === "ACTOR_LEVEL") {
      if (typeof context.actorLevel !== "number") {
        reasons.push("Missing actor level");
        trace.push("ACTOR_LEVEL=UNKNOWN");
        return "UNKNOWN";
      }

      const result = compareNumbers(node.operator, context.actorLevel, node.value)
        ? "TRUE"
        : "FALSE";

      trace.push(`ACTOR_LEVEL=${result}`);
      return result;
    }

    if (node.type === "ABILITY") {
      const ability = context.abilities?.[node.ability];

      if (typeof ability !== "number") {
        reasons.push(`Missing ability '${node.ability}'`);
        trace.push("ABILITY=UNKNOWN");
        return "UNKNOWN";
      }

      const result = compareNumbers(node.operator, ability, node.value)
        ? "TRUE"
        : "FALSE";

      trace.push(`ABILITY(${node.ability})=${result}`);
      return result;
    }

    if (node.type === "PROFICIENCY") {
      if (!context.proficiencies) {
        reasons.push("Missing proficiency set");
        trace.push("PROFICIENCY=UNKNOWN");
        return "UNKNOWN";
      }

      const result = context.proficiencies.has(node.key) ? "TRUE" : "FALSE";
      trace.push(`PROFICIENCY(${node.key})=${result}`);
      return result;
    }

    if (node.type === "HAS_ASSET") {
      if (!context.ownedAssetIds) {
        reasons.push("Missing owned asset set");
        trace.push("HAS_ASSET=UNKNOWN");
        return "UNKNOWN";
      }

      const result = context.ownedAssetIds.has(node.assetId) ? "TRUE" : "FALSE";
      trace.push(`HAS_ASSET(${node.assetId})=${result}`);
      return result;
    }

    if (node.type === "HAS_TAG") {
      if (!context.tags) {
        reasons.push("Missing tag set");
        trace.push("HAS_TAG=UNKNOWN");
        return "UNKNOWN";
      }

      const result = context.tags.has(node.tag) ? "TRUE" : "FALSE";
      trace.push(`HAS_TAG(${node.tag})=${result}`);
      return result;
    }

    const fact = context.facts?.[node.factKey];

    if (!fact) {
      reasons.push(`Missing fact '${node.factKey}'`);
      trace.push(`FACT(${node.factKey})=UNKNOWN`);
      return "UNKNOWN";
    }

    if (fact === "UNKNOWN") {
      trace.push(`FACT(${node.factKey})=UNKNOWN`);
      return "UNKNOWN";
    }

    const result = fact === node.expected ? "TRUE" : "FALSE";
    trace.push(`FACT(${node.factKey})=${result}`);
    return result;
  };

  return {
    outcome: evaluate(expression),
    trace,
    reasons,
  };
}

/** A roll with its dice count resolved; null when a value it depends on is missing. */
export type ResolvedDice = { count: number | null; faces: DieFaces };

/**
 * An effect payload with all expressions replaced by numbers. Values that cannot be computed are
 * null and explained in `reasons`; nothing is rolled.
 */
export type ResolvedEffectPayload =
  | { type: "MODIFIER"; stat: string; amount: number | null }
  | { type: "BASE_VALUE"; stat: string; value: number | null }
  | { type: "GRANT"; grantType: string; value: string }
  | { type: "ADVANTAGE"; mode: "ADVANTAGE" | "DISADVANTAGE"; on: string }
  | { type: "RESOURCE"; resourceKey: string; amount: number | null }
  | {
      type: "DAMAGE";
      damageType: string;
      dice: ResolvedDice | null;
      amount: number | null;
    }
  | { type: "HEAL"; dice: ResolvedDice | null; amount: number | null }
  | { type: "MOVEMENT"; mode: string; distance: number | null }
  | { type: "INFORMATION"; message: string };

export function resolveEffectPayload(
  payload: EffectPayload,
  context: ValueEvaluationContext,
  options: RuleEvaluationOptions = {},
): { payload: ResolvedEffectPayload; reasons: string[] } {
  const reasons: string[] = [];
  const value = (expression: ValueExpression): number | null => {
    const result = evaluateValueExpression(expression, context, options);

    reasons.push(...result.reasons);

    return result.value;
  };
  const optional = (expression: ValueExpression | undefined): number | null =>
    expression === undefined ? null : value(expression);
  const dice = (formula: DiceFormula | undefined): ResolvedDice | null => {
    if (!formula) {
      return null;
    }

    if ("ref" in formula) {
      const provided = context.dice?.[formula.ref];

      if (!provided) {
        reasons.push(`Missing dice '${formula.ref}'`);
      }

      return provided ? { ...provided } : null;
    }

    const count = value(formula.count);

    // Dice can only be counted in whole, non-negative numbers.
    return { count: count === null ? null : Math.max(0, Math.floor(count)), faces: formula.faces };
  };

  switch (payload.type) {
    case "MODIFIER":
      return { payload: { ...payload, amount: value(payload.amount) }, reasons };
    case "BASE_VALUE":
      return { payload: { ...payload, value: value(payload.value) }, reasons };
    case "RESOURCE":
      return { payload: { ...payload, amount: value(payload.amount) }, reasons };
    case "DAMAGE":
      return {
        payload: {
          type: "DAMAGE",
          damageType: payload.damageType,
          dice: dice(payload.dice),
          amount: optional(payload.amount),
        },
        reasons,
      };
    case "HEAL":
      return {
        payload: { type: "HEAL", dice: dice(payload.dice), amount: optional(payload.amount) },
        reasons,
      };
    case "MOVEMENT":
      return { payload: { ...payload, distance: value(payload.distance) }, reasons };
    case "GRANT":
    case "ADVANTAGE":
    case "INFORMATION":
      return { payload, reasons };
  }
}
