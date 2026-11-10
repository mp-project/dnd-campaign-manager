import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { featCategoryEnum } from "#src/modules/feats/index";
import { ABILITIES, featureKeyDto } from "#src/modules/features/index";
import {
  itemCategoryEnum,
  itemCurrencyEnum,
  itemToolCategoryEnum,
} from "#src/modules/items/index";

/**
 * Schemas of the parts of a background definition. Each part is stored as one jsonb value; rules
 * across parts (unique keys, bindings, the edition rules) are checked by
 * `validateBackgroundDefinition` and the service, references to other assets by the service.
 */

export const ABILITY_RULE_MODES = ["NONE", "FIXED", "CHOOSE_2024"] as const;
export const PROFICIENCY_GRANT_TYPES = ["SKILL", "TOOL", "LANGUAGE"] as const;
export const SELECTION_MODES = ["FIXED", "CHOOSE"] as const;
export const GRANT_OPERATIONS = ["GRANT", "UPGRADE", "REPLACE"] as const;
/** Parameters of a granted feature are fixed or come from the character. */
export const BINDING_SOURCES = ["STATIC", "CONTEXT"] as const;
export const EQUIPMENT_OPTION_TYPES = ["EQUIPMENT", "CURRENCY", "MIXED"] as const;
export const PROMPT_TYPES = ["PERSONALITY_TRAIT", "IDEAL", "BOND", "FLAW", "OTHER"] as const;
export const ROLL_DICE = [4, 6, 8, 10, 12, 20, 100] as const;

export type AbilityRuleMode = (typeof ABILITY_RULE_MODES)[number];
export type ProficiencyGrantType = (typeof PROFICIENCY_GRANT_TYPES)[number];
export type Ability = (typeof ABILITIES)[number];
export type Currency = (typeof itemCurrencyEnum.enumValues)[number];

/** The 2024 rule: +3 in total, as +2/+1 or +1/+1/+1, from the three abilities the background names. */
export const ABILITY_INCREASE_2024 = { abilities: 3, total: 3, maximumPerAbility: 2 } as const;

/** Maximum entries per list part. */
export const BACKGROUND_PART_MAX_ITEMS = 30;
export const BACKGROUND_SECTION_MAX_LENGTH = 20_000;

const displayOrderDto = z.number().int().min(0).max(1_000).default(0);
const labelDto = z.string().trim().min(1).max(160);
/** A code such as `insight`, `calligraphers-supplies` or `elvish`. */
const codeValueDto = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: "Codes use a-z, 0-9 and single hyphens" });
const abilityDto = z.enum(ABILITIES);

const uniqueBy = <T>(items: readonly T[], keyOf: (item: T) => string) =>
  new Set(items.map(keyOf)).size === items.length;

// ---------------------------------------------------------------------------
// Text sections
// ---------------------------------------------------------------------------

/**
 * A text block such as the feature text, suggested characteristics or a story hook; Markdown,
 * rendered on reading. `gmOnly` sections never reach players.
 */
export const BackgroundSectionSchema = z.strictObject({
  key: featureKeyDto,
  title: labelDto,
  content: z.string().trim().min(1).max(BACKGROUND_SECTION_MAX_LENGTH),
  gmOnly: z.boolean().default(false),
  displayOrder: displayOrderDto,
});

// ---------------------------------------------------------------------------
// Ability score increases
// ---------------------------------------------------------------------------

/**
 * `NONE` (2014), `FIXED` increases (homebrew), or `CHOOSE_2024`: the character distributes +3 over
 * the three abilities named here, at most +2 on one.
 */
export const AbilityRuleSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("NONE") }),
  z
    .strictObject({
      mode: z.literal("FIXED"),
      increases: z
        .array(z.strictObject({ ability: abilityDto, amount: z.number().int().min(1).max(2) }))
        .min(1)
        .max(ABILITIES.length),
    })
    .refine((rule) => uniqueBy(rule.increases, (increase) => increase.ability), {
      path: ["increases"],
      message: "Abilities must be unique",
    }),
  z
    .strictObject({
      mode: z.literal("CHOOSE_2024"),
      allowedAbilities: z.array(abilityDto).length(ABILITY_INCREASE_2024.abilities),
      totalIncrease: z.literal(ABILITY_INCREASE_2024.total).default(ABILITY_INCREASE_2024.total),
      maximumPerAbility: z
        .literal(ABILITY_INCREASE_2024.maximumPerAbility)
        .default(ABILITY_INCREASE_2024.maximumPerAbility),
    })
    .refine((rule) => uniqueBy(rule.allowedAbilities, (ability) => ability), {
      path: ["allowedAbilities"],
      message: "Abilities must be unique",
    }),
]);

// ---------------------------------------------------------------------------
// Proficiencies
// ---------------------------------------------------------------------------

const proficiencyOptionShape = {
  code: codeValueDto.nullable().default(null),
  /** A tool item; only for `TOOL`. */
  assetId: uuidDto.nullable().default(null),
};

export const ProficiencyOptionSchema = z
  .strictObject(proficiencyOptionShape)
  .refine((option) => (option.code === null) !== (option.assetId === null), {
    message: "An option has either a code or an asset",
  });

const proficiencyGrantShape = {
  key: featureKeyDto,
  type: z.enum(PROFICIENCY_GRANT_TYPES),
  selectionMode: z.enum(SELECTION_MODES),
  /** How many the character chooses; only for `CHOOSE`. */
  choiceCount: z.number().int().min(1).max(10).nullable().default(null),
  displayOrder: displayOrderDto,
};

/**
 * Grants as stored, without the checks; for the player view, which leaves out options of assets
 * the player may not see.
 */
export const ProficiencyGrantViewSchema = z.strictObject({
  ...proficiencyGrantShape,
  options: z.array(z.strictObject(proficiencyOptionShape)),
});

/**
 * `FIXED`: the character gets every option. `CHOOSE`: `choiceCount` of the options, or of any
 * proficiency of the type when there are none ("two languages of your choice").
 */
export const ProficiencyGrantSchema = z
  .strictObject({
    ...proficiencyGrantShape,
    options: z.array(ProficiencyOptionSchema).max(50).default([]),
  })
  .superRefine((grant, ctx) => {
    if (grant.selectionMode === "FIXED") {
      if (grant.choiceCount !== null) {
        ctx.addIssue({ code: "custom", path: ["choiceCount"], message: "Fixed grants have no choice count" });
      }

      if (grant.options.length === 0) {
        ctx.addIssue({ code: "custom", path: ["options"], message: "A fixed grant needs options" });
      }
    }

    if (grant.selectionMode === "CHOOSE") {
      if (grant.choiceCount === null) {
        ctx.addIssue({ code: "custom", path: ["choiceCount"], message: "A choice needs a count" });
      } else if (grant.options.length > 0 && grant.choiceCount > grant.options.length) {
        ctx.addIssue({
          code: "custom",
          path: ["choiceCount"],
          message: "A choice cannot require more options than it offers",
        });
      }
    }

    grant.options.forEach((option, index) => {
      if (option.assetId !== null && grant.type !== "TOOL") {
        ctx.addIssue({
          code: "custom",
          path: ["options", index, "assetId"],
          message: "Only tool proficiencies name an item",
        });
      }
    });

    if (!uniqueBy(grant.options, (option) => option.code ?? option.assetId ?? "")) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Options must be unique" });
    }
  });

// ---------------------------------------------------------------------------
// Feats
// ---------------------------------------------------------------------------

/** Which feats a `CHOOSE` grant offers: by category, optionally only the named ones. */
export const FeatOptionFilterSchema = z.strictObject({
  categories: z.array(z.enum(featCategoryEnum.enumValues)).min(1).max(featCategoryEnum.enumValues.length),
  featAssetIds: z.array(uuidDto).max(50).default([]),
});

const featGrantShape = {
  key: featureKeyDto,
  selectionMode: z.enum(SELECTION_MODES),
  featAssetId: uuidDto.nullable().default(null),
  optionFilter: FeatOptionFilterSchema.nullable().default(null),
  displayOrder: displayOrderDto,
};

/** Grants as stored; the player view leaves out hidden feats. */
export const FeatGrantViewSchema = z.strictObject(featGrantShape);

/** `FIXED` names the feat (2024: the origin feat); `CHOOSE` offers feats through the filter. */
export const FeatGrantSchema = z.strictObject(featGrantShape).superRefine((grant, ctx) => {
  if (grant.selectionMode === "FIXED" && (grant.featAssetId === null || grant.optionFilter !== null)) {
    ctx.addIssue({
      code: "custom",
      path: ["featAssetId"],
      message: "A fixed grant names a feat and has no filter",
    });
  }

  if (grant.selectionMode === "CHOOSE" && (grant.featAssetId !== null || grant.optionFilter === null)) {
    ctx.addIssue({
      code: "custom",
      path: ["optionFilter"],
      message: "A choice has a filter and names no feat",
    });
  }

  if (grant.optionFilter && !uniqueBy(grant.optionFilter.featAssetIds, (id) => id)) {
    ctx.addIssue({ code: "custom", path: ["optionFilter", "featAssetIds"], message: "Feats must be unique" });
  }
});

// ---------------------------------------------------------------------------
// Feature grants
// ---------------------------------------------------------------------------

/** Where the value of a feature parameter comes from when the background grants the feature. */
export const BackgroundFeatureBindingSchema = z
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
  featureAssetId: uuidDto,
  operation: z.enum(GRANT_OPERATIONS).default("GRANT"),
  /** The feature an upgrade or replacement applies to, e.g. one the character has from a species. */
  targetFeatureAssetId: uuidDto.nullable().default(null),
  displayOrder: displayOrderDto,
  bindings: z.array(BackgroundFeatureBindingSchema).max(20).default([]),
};

/** Grants as stored, without the checks; for the player view, which leaves out hidden bindings. */
export const BackgroundFeatureGrantViewSchema = z.strictObject({
  ...featureGrantShape,
  bindings: z.array(z.strictObject(BackgroundFeatureBindingSchema.shape)),
});

export const BackgroundFeatureGrantSchema = z
  .strictObject(featureGrantShape)
  .superRefine((grant, ctx) => {
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

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

/** Items a choice entry offers: by category and tool category, optionally only the named ones. */
export const EquipmentChoiceFilterSchema = z
  .strictObject({
    categories: z.array(z.enum(itemCategoryEnum.enumValues)).max(12).default([]),
    toolCategories: z.array(z.enum(itemToolCategoryEnum.enumValues)).max(4).default([]),
    itemAssetIds: z.array(uuidDto).max(50).default([]),
  })
  .refine(
    (filter) =>
      filter.categories.length + filter.toolCategories.length + filter.itemAssetIds.length > 0,
    { message: "A filter needs categories, tool categories or items" },
  );

const equipmentEntryShape = {
  key: featureKeyDto,
  /** A fixed item; null for a choice. */
  itemAssetId: uuidDto.nullable().default(null),
  quantity: z.number().int().min(1).max(1_000).default(1),
  /** The character picks one item that fits ("one type of artisan's tools"). */
  choiceFilter: EquipmentChoiceFilterSchema.nullable().default(null),
};

export const EquipmentEntryViewSchema = z.strictObject(equipmentEntryShape);

export const EquipmentEntrySchema = z
  .strictObject(equipmentEntryShape)
  .refine((entry) => (entry.itemAssetId === null) !== (entry.choiceFilter === null), {
    path: ["itemAssetId"],
    message: "An entry has either a fixed item or a choice filter",
  });

/** Coins per currency, e.g. `{ GP: 50 }`. */
export const CurrencyAmountsSchema = z
  .partialRecord(z.enum(itemCurrencyEnum.enumValues), z.number().int().min(1).max(100_000))
  .refine((amounts) => Object.keys(amounts).length > 0, { message: "Currency needs an amount" });

const equipmentOptionShape = {
  code: featureKeyDto,
  name: labelDto,
  optionType: z.enum(EQUIPMENT_OPTION_TYPES),
  currency: CurrencyAmountsSchema.nullable().default(null),
  displayOrder: displayOrderDto,
};

/** Options as stored; the player view leaves out entries of items the player may not see. */
export const EquipmentOptionViewSchema = z.strictObject({
  ...equipmentOptionShape,
  entries: z.array(EquipmentEntryViewSchema),
});

/** One package the character takes, such as "A: the listed gear" or "B: 50 GP". */
export const EquipmentOptionSchema = z
  .strictObject({
    ...equipmentOptionShape,
    entries: z.array(EquipmentEntrySchema).max(BACKGROUND_PART_MAX_ITEMS).default([]),
  })
  .superRefine((option, ctx) => {
    if (option.optionType !== "EQUIPMENT" && option.currency === null) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "This option needs currency" });
    }

    if (option.optionType === "EQUIPMENT" && option.currency !== null) {
      ctx.addIssue({ code: "custom", path: ["currency"], message: "Equipment options have no currency" });
    }

    if (option.optionType !== "CURRENCY" && option.entries.length === 0) {
      ctx.addIssue({ code: "custom", path: ["entries"], message: "This option needs entries" });
    }

    if (option.optionType === "CURRENCY" && option.entries.length > 0) {
      ctx.addIssue({ code: "custom", path: ["entries"], message: "Currency options have no entries" });
    }

    if (!uniqueBy(option.entries, (entry) => entry.key)) {
      ctx.addIssue({ code: "custom", path: ["entries"], message: "Entry keys must be unique" });
    }
  });

// ---------------------------------------------------------------------------
// Prompt tables
// ---------------------------------------------------------------------------

export const PromptOptionSchema = z
  .strictObject({
    rollMin: z.number().int().min(1).max(100).nullable().default(null),
    rollMax: z.number().int().min(1).max(100).nullable().default(null),
    text: z.string().trim().min(1).max(1_000),
  })
  .refine((option) => (option.rollMin === null) === (option.rollMax === null), {
    path: ["rollMax"],
    message: "A roll range needs both ends",
  })
  .refine((option) => option.rollMin === null || (option.rollMax ?? 0) >= option.rollMin, {
    path: ["rollMax"],
    message: "The range ends before it starts",
  });

/**
 * Suggestions such as personality traits, ideals, bonds and flaws. With `rollDie`, every result of
 * the die belongs to exactly one option; without it, options carry no range.
 */
export const PromptTableSchema = z
  .strictObject({
    key: featureKeyDto,
    promptType: z.enum(PROMPT_TYPES),
    title: labelDto,
    rollDie: z
      .number()
      .int()
      .refine((die) => (ROLL_DICE as readonly number[]).includes(die), {
        message: `A die has ${ROLL_DICE.join(", ")} sides`,
      })
      .nullable()
      .default(null),
    displayOrder: displayOrderDto,
    options: z.array(PromptOptionSchema).min(1).max(100),
  })
  .superRefine((table, ctx) => {
    const die = table.rollDie;

    if (die === null) {
      table.options.forEach((option, index) => {
        if (option.rollMin !== null) {
          ctx.addIssue({
            code: "custom",
            path: ["options", index, "rollMin"],
            message: "Options of a table without a die have no range",
          });
        }
      });

      return;
    }

    const covered = new Array<number>(die + 1).fill(0);

    table.options.forEach((option, index) => {
      if (option.rollMin === null || option.rollMax === null) {
        ctx.addIssue({ code: "custom", path: ["options", index, "rollMin"], message: "An option needs a roll range" });
        return;
      }

      if (option.rollMax > die) {
        ctx.addIssue({ code: "custom", path: ["options", index, "rollMax"], message: `The die has only ${die} sides` });
        return;
      }

      for (let roll = option.rollMin; roll <= option.rollMax; roll += 1) {
        covered[roll] = (covered[roll] ?? 0) + 1;
      }
    });

    if (covered.slice(1).some((count) => count > 1)) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Roll ranges overlap" });
    }

    if (covered.slice(1).some((count) => count === 0)) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Every result of the die needs an option" });
    }
  });

// ---------------------------------------------------------------------------
// Whole definition
// ---------------------------------------------------------------------------

export const BackgroundDefinitionSchema = z.strictObject({
  sections: z.array(BackgroundSectionSchema).max(BACKGROUND_PART_MAX_ITEMS),
  abilityRule: AbilityRuleSchema,
  proficiencyGrants: z.array(ProficiencyGrantSchema).max(BACKGROUND_PART_MAX_ITEMS),
  featGrants: z.array(FeatGrantSchema).max(5),
  featureGrants: z.array(BackgroundFeatureGrantSchema).max(BACKGROUND_PART_MAX_ITEMS),
  equipmentOptions: z.array(EquipmentOptionSchema).max(10),
  promptTables: z.array(PromptTableSchema).max(BACKGROUND_PART_MAX_ITEMS),
});

export type BackgroundSection = z.infer<typeof BackgroundSectionSchema>;
export type AbilityRule = z.infer<typeof AbilityRuleSchema>;
export type ProficiencyOption = z.infer<typeof ProficiencyOptionSchema>;
export type ProficiencyGrant = z.infer<typeof ProficiencyGrantSchema>;
export type FeatGrant = z.infer<typeof FeatGrantSchema>;
export type BackgroundFeatureBinding = z.infer<typeof BackgroundFeatureBindingSchema>;
export type BackgroundFeatureGrant = z.infer<typeof BackgroundFeatureGrantSchema>;
export type EquipmentEntry = z.infer<typeof EquipmentEntrySchema>;
export type EquipmentOption = z.infer<typeof EquipmentOptionSchema>;
export type PromptTable = z.infer<typeof PromptTableSchema>;
export type BackgroundDefinition = z.infer<typeof BackgroundDefinitionSchema>;
