import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { DIE_FACES, effectPayloadSchema, predicateExpressionSchema } from "#core/rules/contracts";
import { featureKeyDto } from "#src/modules/features/index";
import {
  ITEM_MAX_CHARGES,
  WEAPON_PROPERTIES,
} from "#src/modules/items/domain/entities/ItemsTable";

/**
 * Schemas of the jsonb parts of an item definition. Rules across parts and the typed columns
 * (unique keys, attunement of effects, charges of spells, allowed variables …) are checked by
 * `validateItemDefinition`, references to other assets by the service.
 */

/**
 * When an effect, grant or spell of an item works. `CARRIED`: while an actor has the item;
 * `EQUIPPED`: while it is worn or wielded; `ATTUNED`: while the actor is attuned to it; `ON_USE`:
 * only when the item is used (a potion drunk, a charge spent), never passively.
 */
export const ITEM_ACTIVATIONS = ["CARRIED", "EQUIPPED", "ATTUNED", "ON_USE"] as const;
export const PASSIVE_ACTIVATIONS = ["CARRIED", "EQUIPPED", "ATTUNED"] as const;
export const GRANT_OPERATIONS = ["GRANT", "UPGRADE", "REPLACE"] as const;
/** Parameters of a granted feature are fixed or come from the actor. */
export const BINDING_SOURCES = ["STATIC", "CONTEXT"] as const;
export const RECHARGE_TIMINGS = ["DAWN", "DUSK", "SHORT_REST", "LONG_REST", "SPECIAL"] as const;

export type ItemActivation = (typeof ITEM_ACTIVATIONS)[number];

/** Maximum entries per list part. */
export const ITEM_PART_MAX_ITEMS = 30;

const labelDto = z.string().trim().min(1).max(160);
const displayOrderDto = z.number().int().min(0).max(1_000);
const shortTextDto = z.string().trim().min(1).max(2_000);
const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string) =>
  new Set(items.map(keyOf)).size === items.length;

export const dieFacesDto = z.literal([...DIE_FACES]);

/** Unique weapon properties such as `FINESSE` or `VERSATILE`. */
export const WeaponPropertiesSchema = z
  .array(z.enum(WEAPON_PROPERTIES))
  .max(WEAPON_PROPERTIES.length)
  .refine((values) => uniqueBy(values, (value) => value), { message: "Properties must be unique" });

/**
 * Something the item does, as a `#core/rules` payload: `MODIFIER ability.str +1`, `MODIFIER ac +1`,
 * `BASE_VALUE ability.str 19`, `ADVANTAGE`, `GRANT` (a resistance, a sense …) or, on use, `HEAL`
 * and `DAMAGE`. `ON_USE` effects may cost charges.
 */
export const ItemEffectSchema = z
  .strictObject({
    key: featureKeyDto,
    label: labelDto.nullable().default(null),
    activation: z.enum(ITEM_ACTIVATIONS).default("EQUIPPED"),
    /** Charges one use costs; only for `ON_USE`. */
    chargeCost: z.number().int().min(0).max(ITEM_MAX_CHARGES).default(0),
    condition: predicateExpressionSchema.nullable().default(null),
    payload: effectPayloadSchema,
    displayOrder: displayOrderDto.default(0),
  })
  .superRefine((effect, ctx) => {
    if (effect.chargeCost > 0 && effect.activation !== "ON_USE") {
      ctx.addIssue({ code: "custom", path: ["chargeCost"], message: "Only effects on use cost charges" });
    }
  });

/** Where the value of a feature parameter comes from when the item grants the feature. */
export const ItemFeatureBindingSchema = z
  .strictObject({
    parameterKey: featureKeyDto,
    bindingSource: z.enum(BINDING_SOURCES),
    staticValue: z.json().nullable().default(null),
    /** A value of the actor, e.g. `level.character`. */
    contextKey: z.string().min(1).max(100).nullable().default(null),
  })
  .superRefine((binding, ctx) => {
    if ((binding.bindingSource === "STATIC") !== (binding.staticValue !== null)) {
      ctx.addIssue({ code: "custom", path: ["staticValue"], message: "Static bindings, and only they, set a value" });
    }

    if ((binding.bindingSource === "CONTEXT") !== (binding.contextKey !== null)) {
      ctx.addIssue({ code: "custom", path: ["contextKey"], message: "Context bindings, and only they, name a key" });
    }
  });

const featureGrantShape = {
  key: featureKeyDto,
  featureAssetId: uuidDto,
  operation: z.enum(GRANT_OPERATIONS).default("GRANT"),
  /** The feature an upgrade or replacement applies to. */
  targetFeatureAssetId: uuidDto.nullable().default(null),
  activation: z.enum(PASSIVE_ACTIVATIONS).default("EQUIPPED"),
  displayOrder: displayOrderDto.default(0),
  bindings: z.array(ItemFeatureBindingSchema).max(20).default([]),
};

/** Grants as stored, without the checks; for the player view, which leaves out hidden grants. */
export const ItemFeatureGrantViewSchema = z.strictObject({
  ...featureGrantShape,
  bindings: z.array(z.strictObject(ItemFeatureBindingSchema.shape)),
});

/** A feature the item gives its holder, for abilities too complex for a single effect. */
export const ItemFeatureGrantSchema = z.strictObject(featureGrantShape).superRefine((grant, ctx) => {
  if (grant.operation === "GRANT" && grant.targetFeatureAssetId !== null) {
    ctx.addIssue({ code: "custom", path: ["targetFeatureAssetId"], message: "Plain grants have no target" });
  }

  if (grant.operation !== "GRANT") {
    if (grant.targetFeatureAssetId === null) {
      ctx.addIssue({
        code: "custom",
        path: ["targetFeatureAssetId"],
        message: "Upgrades and replacements need a target",
      });
    } else if (grant.targetFeatureAssetId === grant.featureAssetId) {
      ctx.addIssue({
        code: "custom",
        path: ["targetFeatureAssetId"],
        message: "A feature cannot upgrade or replace itself",
      });
    }
  }

  if (!uniqueBy(grant.bindings, (binding) => binding.parameterKey)) {
    ctx.addIssue({ code: "custom", path: ["bindings"], message: "One binding per parameter" });
  }
});

/**
 * A spell the item casts (wand, staff, scroll). Without `saveDc`/`attackBonus` the wielder's own
 * values apply; `castAtLevel` is the slot level of the cast, at least the spell level.
 */
export const ItemSpellSchema = z.strictObject({
  key: featureKeyDto,
  spellAssetId: uuidDto,
  chargeCost: z.number().int().min(0).max(ITEM_MAX_CHARGES).default(0),
  castAtLevel: z.number().int().min(1).max(9).nullable().default(null),
  saveDc: z.number().int().min(1).max(40).nullable().default(null),
  attackBonus: z.number().int().min(-10).max(40).nullable().default(null),
  activation: z.enum(PASSIVE_ACTIVATIONS).default("EQUIPPED"),
  displayOrder: displayOrderDto.default(0),
});

/** How many charges come back and when. */
export const ItemRechargeSchema = z.strictObject({
  timing: z.enum(RECHARGE_TIMINGS),
  regain: z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("ALL") }),
    z.strictObject({
      type: z.literal("DICE"),
      count: z.number().int().min(1).max(20),
      faces: dieFacesDto,
      bonus: z.number().int().min(0).max(100).default(0),
    }),
    z.strictObject({ type: z.literal("FIXED"), amount: z.number().int().min(1).max(ITEM_MAX_CHARGES) }),
  ]),
  /** What else happens, e.g. a chance to crumble when the last charge is spent. */
  note: shortTextDto.nullable().default(null),
});

/** A sentient item's mind; only for magic items. */
export const ItemSentienceSchema = z.strictObject({
  intelligence: z.number().int().min(1).max(30),
  wisdom: z.number().int().min(1).max(30),
  charisma: z.number().int().min(1).max(30),
  alignment: z.string().trim().min(1).max(60).nullable().default(null),
  communication: shortTextDto,
  senses: shortTextDto,
  personality: shortTextDto.nullable().default(null),
  purpose: shortTextDto.nullable().default(null),
  conflict: shortTextDto.nullable().default(null),
});

const part = <T extends z.ZodType>(item: T) => z.array(item).max(ITEM_PART_MAX_ITEMS);

export const ItemEffectsSchema = part(ItemEffectSchema);
export const ItemFeatureGrantsSchema = part(ItemFeatureGrantSchema);
export const ItemSpellsSchema = part(ItemSpellSchema);

export const ItemDefinitionPartsSchema = z.strictObject({
  weaponProperties: WeaponPropertiesSchema,
  effects: ItemEffectsSchema,
  featureGrants: ItemFeatureGrantsSchema,
  spells: ItemSpellsSchema,
  recharge: ItemRechargeSchema.nullable(),
  sentience: ItemSentienceSchema.nullable(),
});

export type ItemEffect = z.infer<typeof ItemEffectSchema>;
export type ItemFeatureBinding = z.infer<typeof ItemFeatureBindingSchema>;
export type ItemFeatureGrant = z.infer<typeof ItemFeatureGrantSchema>;
export type ItemSpell = z.infer<typeof ItemSpellSchema>;
export type ItemRecharge = z.infer<typeof ItemRechargeSchema>;
export type ItemSentience = z.infer<typeof ItemSentienceSchema>;
export type ItemDefinitionParts = z.infer<typeof ItemDefinitionPartsSchema>;
