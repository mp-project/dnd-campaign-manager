import { z } from "zod";

import { campaignFactValues } from "#core/rules/campaignFacts";

export const valueOperators = [
  "ADD",
  "SUBTRACT",
  "MULTIPLY",
  "DIVIDE",
  "MIN",
  "MAX",
  "FLOOR",
  "CEIL",
] as const;

export type ValueOperator = (typeof valueOperators)[number];

export type ValueExpression =
  | {
      type: "CONST";
      value: number;
    }
  | {
      type: "VAR";
      key: string;
    }
  | {
      type: ValueOperator;
      args: ValueExpression[];
    };

export type PredicateExpression =
  | {
      type: "ALL";
      conditions: PredicateExpression[];
    }
  | {
      type: "ANY";
      conditions: PredicateExpression[];
    }
  | {
      type: "NOT";
      condition: PredicateExpression;
    }
  | {
      type: "COMPARE";
      operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE";
      left: ValueExpression;
      right: ValueExpression;
    }
  | {
      type: "ACTOR_LEVEL";
      operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE";
      value: number;
    }
  | {
      type: "ABILITY";
      ability: string;
      operator: "EQ" | "NEQ" | "GT" | "GTE" | "LT" | "LTE";
      value: number;
    }
  | {
      type: "PROFICIENCY";
      key: string;
    }
  | {
      type: "HAS_ASSET";
      assetId: string;
    }
  | {
      type: "HAS_TAG";
      tag: string;
    }
  | {
      type: "FACT";
      factKey: string;
      expected: (typeof campaignFactValues)[number];
    };

export type TargetSpecification = {
  targetType: "SELF" | "CREATURE" | "LOCATION" | "OBJECT" | "AREA";
  area?: AreaSpecification | undefined;
};

export type AreaSpecification = {
  shape: "cone" | "cube" | "cylinder" | "line" | "sphere";
  size: number;
  unit: "ft" | "m";
};

export const DIE_FACES = [2, 3, 4, 6, 8, 10, 12, 20, 100] as const;

export type DieFaces = (typeof DIE_FACES)[number];

/**
 * Dice to roll, such as `2d6`; the count may grow with level or parameters. `ref` names dice the
 * caller provides, such as a die that grows with level (`scale.martial_arts`).
 */
export type DiceFormula =
  | {
      count: ValueExpression;
      faces: DieFaces;
    }
  | {
      ref: string;
    };

export const ADVANTAGE_MODES = ["ADVANTAGE", "DISADVANTAGE"] as const;

/**
 * What an effect does. Amounts are expressions, so they can depend on levels, parameters and
 * scaling values; rolls carry their dice separately from the flat part.
 */
export type EffectPayload =
  | {
      type: "MODIFIER";
      stat: string;
      amount: ValueExpression;
    }
  | {
      /** Sets a base value, such as armor class without armor; the highest one applies. */
      type: "BASE_VALUE";
      stat: string;
      value: ValueExpression;
    }
  | {
      type: "GRANT";
      grantType: string;
      value: string;
    }
  | {
      type: "ADVANTAGE";
      mode: (typeof ADVANTAGE_MODES)[number];
      on: string;
    }
  | {
      type: "RESOURCE";
      resourceKey: string;
      amount: ValueExpression;
    }
  | {
      type: "DAMAGE";
      damageType: string;
      dice?: DiceFormula | undefined;
      amount?: ValueExpression | undefined;
    }
  | {
      type: "HEAL";
      dice?: DiceFormula | undefined;
      amount?: ValueExpression | undefined;
    }
  | {
      type: "MOVEMENT";
      mode: string;
      distance: ValueExpression;
    }
  | {
      type: "INFORMATION";
      message: string;
    };

export type EffectPayloadType = EffectPayload["type"];

export const EFFECT_PAYLOAD_TYPES = [
  "MODIFIER",
  "BASE_VALUE",
  "GRANT",
  "ADVANTAGE",
  "RESOURCE",
  "DAMAGE",
  "HEAL",
  "MOVEMENT",
  "INFORMATION",
] as const satisfies readonly EffectPayloadType[];

export const valueExpressionSchema: z.ZodType<ValueExpression> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal("CONST"),
      value: z.number().finite(),
    }),
    z.strictObject({
      type: z.literal("VAR"),
      key: z.string().min(1),
    }),
    z.strictObject({
      type: z.enum(valueOperators),
      args: z.array(valueExpressionSchema).min(1),
    }),
  ]),
);

export const predicateExpressionSchema: z.ZodType<PredicateExpression> = z.lazy(() =>
  z.union([
    z.strictObject({
      type: z.literal("ALL"),
      conditions: z.array(predicateExpressionSchema).min(1),
    }),
    z.strictObject({
      type: z.literal("ANY"),
      conditions: z.array(predicateExpressionSchema).min(1),
    }),
    z.strictObject({
      type: z.literal("NOT"),
      condition: predicateExpressionSchema,
    }),
    z.strictObject({
      type: z.literal("COMPARE"),
      operator: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE"]),
      left: valueExpressionSchema,
      right: valueExpressionSchema,
    }),
    z.strictObject({
      type: z.literal("ACTOR_LEVEL"),
      operator: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE"]),
      value: z.number().int().nonnegative(),
    }),
    z.strictObject({
      type: z.literal("ABILITY"),
      ability: z.string().min(1),
      operator: z.enum(["EQ", "NEQ", "GT", "GTE", "LT", "LTE"]),
      value: z.number().int().nonnegative(),
    }),
    z.strictObject({
      type: z.literal("PROFICIENCY"),
      key: z.string().min(1),
    }),
    z.strictObject({
      type: z.literal("HAS_ASSET"),
      assetId: z.string().min(1),
    }),
    z.strictObject({
      type: z.literal("HAS_TAG"),
      tag: z.string().min(1),
    }),
    z.strictObject({
      type: z.literal("FACT"),
      factKey: z.string().min(1),
      expected: z.enum(campaignFactValues),
    }),
  ]),
);

const areaSpecificationSchema: z.ZodType<AreaSpecification> = z.strictObject({
  shape: z.enum(["cone", "cube", "cylinder", "line", "sphere"]),
  size: z.number().positive(),
  unit: z.enum(["ft", "m"]),
});

export const targetSpecificationSchema: z.ZodType<TargetSpecification> = z.strictObject({
  targetType: z.enum(["SELF", "CREATURE", "LOCATION", "OBJECT", "AREA"]),
  area: areaSpecificationSchema.optional(),
});

export const diceFormulaSchema: z.ZodType<DiceFormula> = z.union([
  z.strictObject({
    count: valueExpressionSchema,
    faces: z.literal([...DIE_FACES]),
  }),
  z.strictObject({
    ref: z.string().min(1).max(100),
  }),
]);

const rollAmountShape = {
  dice: diceFormulaSchema.optional(),
  amount: valueExpressionSchema.optional(),
};

const hasRollPart = (value: { dice?: unknown; amount?: unknown }) =>
  value.dice !== undefined || value.amount !== undefined;

const rollPartMessage = { message: "Damage and healing need dice, an amount or both" };

export const effectPayloadSchema: z.ZodType<EffectPayload> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("MODIFIER"),
    stat: z.string().min(1).max(100),
    amount: valueExpressionSchema,
  }),
  z.strictObject({
    type: z.literal("BASE_VALUE"),
    stat: z.string().min(1).max(100),
    value: valueExpressionSchema,
  }),
  z.strictObject({
    type: z.literal("GRANT"),
    grantType: z.string().min(1).max(100),
    value: z.string().min(1).max(200),
  }),
  z.strictObject({
    type: z.literal("ADVANTAGE"),
    mode: z.enum(ADVANTAGE_MODES),
    on: z.string().min(1).max(100),
  }),
  z.strictObject({
    type: z.literal("RESOURCE"),
    resourceKey: z.string().min(1).max(100),
    amount: valueExpressionSchema,
  }),
  z
    .strictObject({
      type: z.literal("DAMAGE"),
      damageType: z.string().min(1).max(100),
      ...rollAmountShape,
    })
    .refine(hasRollPart, rollPartMessage),
  z
    .strictObject({
      type: z.literal("HEAL"),
      ...rollAmountShape,
    })
    .refine(hasRollPart, rollPartMessage),
  z.strictObject({
    type: z.literal("MOVEMENT"),
    mode: z.string().min(1).max(100),
    distance: valueExpressionSchema,
  }),
  z.strictObject({
    type: z.literal("INFORMATION"),
    message: z.string().min(1).max(2_000),
  }),
]);

/** Every value expression inside a payload, so limits and variable keys can be checked. */
export function listPayloadExpressions(payload: EffectPayload): ValueExpression[] {
  switch (payload.type) {
    case "MODIFIER":
    case "RESOURCE":
      return [payload.amount];
    case "BASE_VALUE":
      return [payload.value];
    case "DAMAGE":
    case "HEAL":
      return [
        payload.dice && "count" in payload.dice ? payload.dice.count : undefined,
        payload.amount,
      ].filter(
        (expression): expression is ValueExpression => expression !== undefined,
      );
    case "MOVEMENT":
      return [payload.distance];
    case "GRANT":
    case "ADVANTAGE":
    case "INFORMATION":
      return [];
  }
}

export function parseValueExpression(input: unknown): ValueExpression {
  return valueExpressionSchema.parse(input);
}

export function parsePredicateExpression(input: unknown): PredicateExpression {
  return predicateExpressionSchema.parse(input);
}

export function parseTargetSpecification(input: unknown): TargetSpecification {
  return targetSpecificationSchema.parse(input);
}

export function parseEffectPayload(input: unknown): EffectPayload {
  return effectPayloadSchema.parse(input);
}

/** Keys of dice the caller has to provide for this payload. */
export function listPayloadDiceRefs(payload: EffectPayload): string[] {
  return (payload.type === "DAMAGE" || payload.type === "HEAL") &&
    payload.dice !== undefined &&
    "ref" in payload.dice
    ? [payload.dice.ref]
    : [];
}
