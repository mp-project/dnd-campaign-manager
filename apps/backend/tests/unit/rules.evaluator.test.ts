import {
  evaluatePredicateExpression,
  evaluateValueExpression,
  parseEffectPayload,
  parsePredicateExpression,
  parseValueExpression,
} from "#core/rules";

describe("rule contracts and evaluators", () => {
  it("evaluates value expressions with whitelisted operators", () => {
    const expression = parseValueExpression({
      type: "ADD",
      args: [
        { type: "CONST", value: 2 },
        {
          type: "MULTIPLY",
          args: [
            { type: "VAR", key: "proficiencyBonus" },
            { type: "CONST", value: 3 },
          ],
        },
      ],
    });

    const result = evaluateValueExpression(expression, {
      values: {
        proficiencyBonus: 4,
      },
      allowedValueKeys: new Set(["proficiencyBonus"]),
    });

    expect(result.value).toBe(14);
    expect(result.reasons).toEqual([]);
  });

  it("returns unknown value and reason for disallowed variables and divide-by-zero", () => {
    const unknownVariable = evaluateValueExpression(
      parseValueExpression({
        type: "VAR",
        key: "forged",
      }),
      {
        values: {},
        allowedValueKeys: new Set(["known"]),
      },
    );

    expect(unknownVariable.value).toBeNull();
    expect(unknownVariable.reasons).toContain("Unknown variable key 'forged'");

    const divideByZero = evaluateValueExpression(
      parseValueExpression({
        type: "DIVIDE",
        args: [
          { type: "CONST", value: 10 },
          { type: "CONST", value: 0 },
        ],
      }),
      {
        values: {},
        allowedValueKeys: new Set(),
      },
    );

    expect(divideByZero.value).toBeNull();
    expect(divideByZero.reasons).toContain("Division by zero");
  });

  it("evaluates predicates with tri-state UNKNOWN behavior", () => {
    const predicate = parsePredicateExpression({
      type: "ALL",
      conditions: [
        {
          type: "ACTOR_LEVEL",
          operator: "GTE",
          value: 5,
        },
        {
          type: "FACT",
          factKey: "hasMetNpc:gandalf",
          expected: "TRUE",
        },
      ],
    });

    const unknownResult = evaluatePredicateExpression(predicate, {
      values: {},
      allowedValueKeys: new Set(),
      actorLevel: 6,
      facts: {},
    });

    expect(unknownResult.outcome).toBe("UNKNOWN");
    expect(unknownResult.reasons).toContain("Missing fact 'hasMetNpc:gandalf'");

    const trueResult = evaluatePredicateExpression(predicate, {
      values: {},
      allowedValueKeys: new Set(),
      actorLevel: 6,
      facts: {
        "hasMetNpc:gandalf": "TRUE",
      },
    });

    expect(trueResult.outcome).toBe("TRUE");
  });

  it("enforces depth and node limits", () => {
    const deepPredicate = parsePredicateExpression({
      type: "NOT",
      condition: {
        type: "NOT",
        condition: {
          type: "NOT",
          condition: {
            type: "ACTOR_LEVEL",
            operator: "GTE",
            value: 1,
          },
        },
      },
    });

    expect(() =>
      evaluatePredicateExpression(
        deepPredicate,
        {
          values: {},
          allowedValueKeys: new Set(),
        },
        { maxDepth: 2 },
      ),
    ).toThrow("depth limit");
  });

  it("rejects unknown effect payload types", () => {
    expect(() =>
      parseEffectPayload({
        type: "TELEPORT",
        location: "x",
      }),
    ).toThrow();

    const payload = parseEffectPayload({
      type: "INFORMATION",
      message: "Known lore",
    });

    expect(payload.type).toBe("INFORMATION");
  });
});
