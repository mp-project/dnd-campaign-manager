import { z } from "zod";

import { campaignFactValues } from "#core/contracts/campaign-facts";

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

export type EffectPayload =
  | {
      type: "MODIFIER";
      stat: string;
      delta: number;
    }
  | {
      type: "GRANT";
      grantType: string;
      value: string;
    }
  | {
      type: "RESOURCE";
      resourceKey: string;
      amount: number;
    }
  | {
      type: "DAMAGE";
      damageType: string;
      amount: ValueExpression;
    }
  | {
      type: "HEAL";
      amount: ValueExpression;
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

const valueExpressionSchema: z.ZodType<ValueExpression> = z.lazy(() =>
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

const predicateExpressionSchema: z.ZodType<PredicateExpression> = z.lazy(() =>
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

const targetSpecificationSchema: z.ZodType<TargetSpecification> = z.strictObject({
  targetType: z.enum(["SELF", "CREATURE", "LOCATION", "OBJECT", "AREA"]),
  area: areaSpecificationSchema.optional(),
});

const effectPayloadSchema: z.ZodType<EffectPayload> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("MODIFIER"),
    stat: z.string().min(1),
    delta: z.number().finite(),
  }),
  z.strictObject({
    type: z.literal("GRANT"),
    grantType: z.string().min(1),
    value: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("RESOURCE"),
    resourceKey: z.string().min(1),
    amount: z.number().finite(),
  }),
  z.strictObject({
    type: z.literal("DAMAGE"),
    damageType: z.string().min(1),
    amount: valueExpressionSchema,
  }),
  z.strictObject({
    type: z.literal("HEAL"),
    amount: valueExpressionSchema,
  }),
  z.strictObject({
    type: z.literal("MOVEMENT"),
    mode: z.string().min(1),
    distance: valueExpressionSchema,
  }),
  z.strictObject({
    type: z.literal("INFORMATION"),
    message: z.string().min(1),
  }),
]);

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
