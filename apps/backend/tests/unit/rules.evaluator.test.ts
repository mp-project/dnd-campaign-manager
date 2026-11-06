import {
  assertExpressionLimits,
  collectVariableKeys,
  evaluatePredicateExpression,
  evaluateValueExpression,
  listPayloadDiceRefs,
  listPayloadExpressions,
  parseEffectPayload,
  parsePredicateExpression,
  parseValueExpression,
  resolveEffectPayload,
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

  it("parses every effect payload type", () => {
    const level = { type: "VAR", key: "level" } as const;

    expect(
      [
        { type: "MODIFIER", stat: "ac", amount: level },
        { type: "BASE_VALUE", stat: "ac", value: { type: "CONST", value: 13 } },
        { type: "GRANT", grantType: "RESISTANCE", value: "fire" },
        { type: "ADVANTAGE", mode: "ADVANTAGE", on: "save.str" },
        { type: "RESOURCE", resourceKey: "rage", amount: { type: "CONST", value: 1 } },
        { type: "DAMAGE", damageType: "fire", dice: { count: level, faces: 6 } },
        { type: "DAMAGE", damageType: "force", amount: level },
        { type: "HEAL", dice: { ref: "scale.die" } },
        { type: "MOVEMENT", mode: "walk", distance: { type: "CONST", value: 10 } },
        { type: "INFORMATION", message: "Lore" },
      ].map((payload) => parseEffectPayload(payload).type),
    ).toEqual([
      "MODIFIER",
      "BASE_VALUE",
      "GRANT",
      "ADVANTAGE",
      "RESOURCE",
      "DAMAGE",
      "DAMAGE",
      "HEAL",
      "MOVEMENT",
      "INFORMATION",
    ]);
  });

  it("rejects rolls without dice or amount, unknown dice and extra fields", () => {
    expect(() => parseEffectPayload({ type: "DAMAGE", damageType: "fire" })).toThrow();
    expect(() => parseEffectPayload({ type: "HEAL" })).toThrow();
    expect(() =>
      parseEffectPayload({
        type: "DAMAGE",
        damageType: "fire",
        dice: { count: { type: "CONST", value: 1 }, faces: 7 },
      }),
    ).toThrow();
    expect(() =>
      parseEffectPayload({ type: "MODIFIER", stat: "ac", amount: { type: "CONST", value: 1 }, delta: 1 }),
    ).toThrow();
  });

  it("lists the expressions and dice references of a payload", () => {
    const payload = parseEffectPayload({
      type: "DAMAGE",
      damageType: "fire",
      dice: { count: { type: "VAR", key: "level" }, faces: 6 },
      amount: { type: "VAR", key: "bonus" },
    });

    expect(listPayloadExpressions(payload)).toHaveLength(2);
    expect(listPayloadDiceRefs(payload)).toEqual([]);
    expect(listPayloadDiceRefs(parseEffectPayload({ type: "HEAL", dice: { ref: "scale.die" } }))).toEqual([
      "scale.die",
    ]);
  });

  it("collects variable keys and enforces limits before evaluation", () => {
    const predicate = parsePredicateExpression({
      type: "ALL",
      conditions: [
        {
          type: "COMPARE",
          operator: "GTE",
          left: { type: "VAR", key: "a" },
          right: { type: "ADD", args: [{ type: "VAR", key: "b" }, { type: "CONST", value: 1 }] },
        },
        { type: "NOT", condition: { type: "PROFICIENCY", key: "stealth" } },
      ],
    });

    expect([...collectVariableKeys({ kind: "predicate", root: predicate })].sort()).toEqual(["a", "b"]);
    expect(() => assertExpressionLimits({ kind: "predicate", root: predicate }, { maxNodes: 3 })).toThrow(
      "node limit",
    );
    expect(() => assertExpressionLimits({ kind: "predicate", root: predicate })).not.toThrow();
  });

  it("resolves payloads to numbers and explains what is missing", () => {
    const context = {
      values: { level: 5 },
      allowedValueKeys: new Set(["level", "bonus"]),
      dice: { "scale.die": { count: 1, faces: 8 as const } },
    };

    expect(
      resolveEffectPayload(
        parseEffectPayload({
          type: "DAMAGE",
          damageType: "fire",
          dice: { count: { type: "DIVIDE", args: [{ type: "VAR", key: "level" }, { type: "CONST", value: 2 }] }, faces: 6 },
          amount: { type: "VAR", key: "bonus" },
        }),
        context,
      ),
    ).toEqual({
      payload: { type: "DAMAGE", damageType: "fire", dice: { count: 2, faces: 6 }, amount: null },
      reasons: ["Missing variable value 'bonus'"],
    });
    expect(
      resolveEffectPayload(parseEffectPayload({ type: "HEAL", dice: { ref: "scale.die" } }), context).payload,
    ).toEqual({ type: "HEAL", dice: { count: 1, faces: 8 }, amount: null });
    expect(
      resolveEffectPayload(parseEffectPayload({ type: "HEAL", dice: { ref: "param.die" } }), context).reasons,
    ).toEqual(["Missing dice 'param.die'"]);
  });
});
