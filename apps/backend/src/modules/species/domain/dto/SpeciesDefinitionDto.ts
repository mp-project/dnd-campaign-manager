import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { featureKeyDto } from "#src/modules/features/index";

/**
 * Schemas of the parts of a species definition. Each part is stored as one jsonb value; rules
 * across entries (unique keys, the base walking speed, the default size, upgrades and replacements
 * among grants) are checked by `validateSpeciesDefinition`, references to other assets by the
 * service.
 */

export const SPECIES_SIZES = ["TINY", "SMALL", "MEDIUM", "LARGE"] as const;
export const MOVEMENT_MODES = ["WALK", "CLIMB", "FLY", "SWIM", "BURROW"] as const;
export const GRANT_OPERATIONS = ["GRANT", "UPGRADE", "REPLACE"] as const;
/** Species have no class table or choices of their own, so parameters are fixed or come from the actor. */
export const BINDING_SOURCES = ["STATIC", "CONTEXT"] as const;

export type SpeciesSize = (typeof SPECIES_SIZES)[number];
export type MovementMode = (typeof MOVEMENT_MODES)[number];
export type GrantOperation = (typeof GRANT_OPERATIONS)[number];

/** Highest character level a grant can wait for. */
export const SPECIES_MAX_CHARACTER_LEVEL = 20;

/** Maximum entries per list part. */
export const SPECIES_PART_MAX_ITEMS = 50;

export const SPECIES_TEXT_SECTION_MAX_LENGTH = 20_000;

const displayOrderDto = z.number().int().min(0).max(1_000);
const labelDto = z.string().trim().min(1).max(160);
const optionalTextDto = (max: number) => z.string().trim().min(1).max(max).nullable().default(null);
const ageDto = z.number().int().min(0).max(100_000).nullable().default(null);

// ---------------------------------------------------------------------------
// Size and movement
// ---------------------------------------------------------------------------

export const SizeOptionSchema = z.strictObject({
  size: z.enum(SPECIES_SIZES),
  /** Taken when the character does not choose; at most one option is the default. */
  isDefault: z.boolean().default(false),
  displayOrder: displayOrderDto.default(0),
});

export const MovementModeSchema = z
  .strictObject({
    mode: z.enum(MOVEMENT_MODES),
    /** Speed in feet; null means equal to the walking speed (2024: climb speed equals speed). */
    distanceFeet: z.number().int().min(0).max(1_000).nullable(),
    /** The base speed of the species; exactly one, a positive walking speed. */
    isBase: z.boolean().default(false),
  })
  .superRefine((movement, ctx) => {
    if (movement.isBase && (movement.mode !== "WALK" || !movement.distanceFeet)) {
      ctx.addIssue({
        code: "custom",
        path: ["isBase"],
        message: "The base speed is a positive walking speed",
      });
    }

    if (movement.mode === "WALK" && movement.distanceFeet === null) {
      ctx.addIssue({
        code: "custom",
        path: ["distanceFeet"],
        message: "The walking speed needs a distance",
      });
    }
  });

// ---------------------------------------------------------------------------
// Age, physique and text
// ---------------------------------------------------------------------------

export const AgeProfileSchema = z
  .strictObject({
    adulthoodAge: ageDto,
    typicalLifespan: ageDto,
    maximumLifespan: ageDto,
    notes: optionalTextDto(2_000),
  })
  .superRefine((profile, ctx) => {
    const ordered = [profile.adulthoodAge, profile.typicalLifespan, profile.maximumLifespan].filter(
      (value): value is number => value !== null,
    );

    if (ordered.some((value, index) => index > 0 && value < (ordered[index - 1] ?? 0))) {
      ctx.addIssue({
        code: "custom",
        path: ["typicalLifespan"],
        message: "Adulthood, typical and maximum lifespan must not decrease",
      });
    }

    if (Object.values(profile).every((value) => value === null)) {
      ctx.addIssue({ code: "custom", path: [], message: "An age profile needs at least one value" });
    }
  });

/** Formulas as printed, such as `4'8" + 2d10`; the character modules roll them if they want to. */
export const PhysicalProfileSchema = z
  .strictObject({
    heightFormula: optionalTextDto(100),
    weightFormula: optionalTextDto(100),
    notes: optionalTextDto(2_000),
  })
  .refine((profile) => Object.values(profile).some((value) => value !== null), {
    message: "A physical profile needs at least one value",
  });

/** A text block of the description, such as traits or names; Markdown, rendered on reading. */
export const TextSectionSchema = z.strictObject({
  key: featureKeyDto,
  title: labelDto,
  content: z.string().trim().min(1).max(SPECIES_TEXT_SECTION_MAX_LENGTH),
  displayOrder: displayOrderDto.default(0),
});

// ---------------------------------------------------------------------------
// Variant groups
// ---------------------------------------------------------------------------

/**
 * A group of variants the character picks from, such as the elven lineage or the draconic
 * ancestry. Variants are assets of their own and name their group by `code`.
 */
export const VariantGroupSchema = z
  .strictObject({
    code: featureKeyDto,
    name: labelDto,
    minimumSelections: z.number().int().min(0).max(10),
    maximumSelections: z.number().int().min(1).max(10),
    /** Required groups must be chosen from; they need at least one selection. */
    required: z.boolean(),
    displayOrder: displayOrderDto.default(0),
  })
  .superRefine((group, ctx) => {
    if (group.minimumSelections > group.maximumSelections) {
      ctx.addIssue({
        code: "custom",
        path: ["minimumSelections"],
        message: "The minimum cannot exceed the maximum",
      });
    }

    if (group.required !== group.minimumSelections > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["required"],
        message: "Required groups need a minimum of at least one, optional groups a minimum of zero",
      });
    }
  });

// ---------------------------------------------------------------------------
// Feature grants
// ---------------------------------------------------------------------------

/** Where the value of a feature parameter comes from when the species grants the feature. */
export const SpeciesFeatureBindingSchema = z
  .strictObject({
    parameterKey: featureKeyDto,
    bindingSource: z.enum(BINDING_SOURCES),
    staticValue: z.json().nullable().default(null),
    contextKey: z.string().min(1).max(100).nullable().default(null),
  })
  .superRefine((binding, ctx) => {
    const valid =
      binding.bindingSource === "STATIC"
        ? binding.staticValue !== null && binding.contextKey === null
        : binding.contextKey !== null && binding.staticValue === null;

    if (!valid) {
      ctx.addIssue({
        code: "custom",
        path: ["bindingSource"],
        message: "A binding sets exactly the value of its source",
      });
    }
  });

const featureGrantShape = {
  key: featureKeyDto,
  /** Character level from which the feature applies, e.g. spells of a lineage at 3 and 5. */
  minimumCharacterLevel: z.number().int().min(1).max(SPECIES_MAX_CHARACTER_LEVEL).default(1),
  featureAssetId: uuidDto,
  operation: z.enum(GRANT_OPERATIONS).default("GRANT"),
  /** The feature an upgrade or replacement applies to; granted by this species or its variant. */
  targetFeatureAssetId: uuidDto.nullable().default(null),
  displayOrder: displayOrderDto.default(0),
  bindings: z.array(SpeciesFeatureBindingSchema).max(20).default([]),
};

/** Grants as stored, without the checks; for the player view, which leaves out hidden bindings. */
export const SpeciesFeatureGrantViewSchema = z.strictObject({
  ...featureGrantShape,
  bindings: z.array(z.strictObject(SpeciesFeatureBindingSchema.shape)),
});

export const SpeciesFeatureGrantSchema = z
  .strictObject(featureGrantShape)
  .superRefine((grant, ctx) => {
    if (grant.operation === "GRANT" && grant.targetFeatureAssetId !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["targetFeatureAssetId"],
        message: "Plain grants have no target",
      });
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

    if (new Set(grant.bindings.map((binding) => binding.parameterKey)).size !== grant.bindings.length) {
      ctx.addIssue({ code: "custom", path: ["bindings"], message: "One binding per parameter" });
    }
  });

export const SpeciesFeatureGrantsSchema = z
  .array(SpeciesFeatureGrantSchema)
  .max(SPECIES_PART_MAX_ITEMS);

// ---------------------------------------------------------------------------
// Whole definition
// ---------------------------------------------------------------------------

export const SpeciesDefinitionSchema = z.strictObject({
  sizeOptions: z.array(SizeOptionSchema).min(1).max(SPECIES_SIZES.length),
  movementModes: z.array(MovementModeSchema).min(1).max(MOVEMENT_MODES.length),
  ageProfile: AgeProfileSchema.nullable(),
  physicalProfile: PhysicalProfileSchema.nullable(),
  textSections: z.array(TextSectionSchema).max(SPECIES_PART_MAX_ITEMS),
  variantGroups: z.array(VariantGroupSchema).max(10),
  featureGrants: SpeciesFeatureGrantsSchema,
});

export type SizeOption = z.infer<typeof SizeOptionSchema>;
export type SpeciesMovementMode = z.infer<typeof MovementModeSchema>;
export type AgeProfile = z.infer<typeof AgeProfileSchema>;
export type PhysicalProfile = z.infer<typeof PhysicalProfileSchema>;
export type TextSection = z.infer<typeof TextSectionSchema>;
export type VariantGroup = z.infer<typeof VariantGroupSchema>;
export type SpeciesFeatureBinding = z.infer<typeof SpeciesFeatureBindingSchema>;
export type SpeciesFeatureGrant = z.infer<typeof SpeciesFeatureGrantSchema>;
export type SpeciesDefinition = z.infer<typeof SpeciesDefinitionSchema>;
