import type { CampaignFactValue } from "#core/contracts/campaign-facts";
import type { PredicateExpression, ValueExpression } from "#core/rules/contracts";

export type RuleEvaluationOptions = {
  maxDepth?: number;
  maxNodes?: number;
};

export type ValueEvaluationContext = {
  values: Record<string, number>;
  allowedValueKeys: ReadonlySet<string>;
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

function enforceNodeAndDepthLimits(input: {
  root: PredicateExpression | ValueExpression;
  maxDepth: number;
  maxNodes: number;
}): void {
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

  if ((input.root as PredicateExpression).type) {
    const rootType = (input.root as PredicateExpression).type;

    if (
      rootType === "ALL" ||
      rootType === "ANY" ||
      rootType === "NOT" ||
      rootType === "COMPARE" ||
      rootType === "ACTOR_LEVEL" ||
      rootType === "ABILITY" ||
      rootType === "PROFICIENCY" ||
      rootType === "HAS_ASSET" ||
      rootType === "HAS_TAG" ||
      rootType === "FACT"
    ) {
      visitPredicate(input.root as PredicateExpression, 1);
      return;
    }
  }

  visitValue(input.root as ValueExpression, 1);
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
  const maxDepth = options.maxDepth ?? 12;
  const maxNodes = options.maxNodes ?? 256;
  enforceNodeAndDepthLimits({ root: expression, maxDepth, maxNodes });

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
  const maxDepth = options.maxDepth ?? 12;
  const maxNodes = options.maxNodes ?? 256;
  enforceNodeAndDepthLimits({ root: expression, maxDepth, maxNodes });

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
