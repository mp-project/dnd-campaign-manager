import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { BackgroundBaseSchema } from "#src/modules/backgrounds/domain/dto/BaseBackgroundDto";
import { ABILITY_RULE_MODES } from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import { ABILITIES, ActorSnapshotSchema, featureKeyDto } from "#src/modules/features/index";

export const RequestCampaignBackgroundsParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignBackgroundParamsSchema = RequestCampaignBackgroundsParamsSchema.extend({
  backgroundId: uuidDto,
});

export const RequestSystemBackgroundParamsSchema = z.strictObject({
  backgroundId: uuidDto,
});

/** Params of routes shared by custom and global backgrounds; without a campaign it is global. */
export const RequestBackgroundScopeParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
});

export const RequestBackgroundParamsSchema = RequestBackgroundScopeParamsSchema.extend({
  backgroundId: uuidDto,
});

const listFilterShape = BackgroundBaseSchema.pick({ status: true, customizationMode: true })
  .partial()
  .extend({
    search: z.string().trim().min(1).max(200).optional(),
    abilityMode: z.enum(ABILITY_RULE_MODES).optional(),
    /** Backgrounds whose ability rule names this ability (fixed or to choose from). */
    ability: z.enum(ABILITIES).optional(),
  }).shape;

/** `status` only applies to GMs and editors; players always get active backgrounds they may see. */
export const RequestCampaignBackgroundsQuerySchema = z
  .strictObject(listFilterShape)
  .extend(paginationDto.shape);

/** The catalog shows global backgrounds for the campaign ruleset and the campaign's own ones. */
export const RequestBackgroundCatalogQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ scope: AssetBaseSchema.shape.scope.optional() })
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemBackgroundsQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

/** A proficiency as a code (`insight`, `elvish`) or, for tools, an item asset id. */
const proficiencyValueDto = z.string().trim().min(1).max(100);

/**
 * The 2014 rule "Customizing a Background": any two skills, a total of two tools or languages, and
 * optionally the feature of another background the campaign may use instead of this one's. Only
 * for backgrounds with `customizationMode: RULESET_CUSTOMIZABLE`.
 */
export const BackgroundCustomizationSchema = z.strictObject({
  skills: z.array(proficiencyValueDto).max(2),
  toolsAndLanguages: z
    .array(z.strictObject({ type: z.enum(["TOOL", "LANGUAGE"]), value: proficiencyValueDto }))
    .max(2),
  /** Background (asset id) whose features replace the features of this one. */
  featureBackgroundAssetId: uuidDto.nullable().default(null),
});

export const PromptSelectionSchema = z
  .strictObject({
    tableKey: featureKeyDto,
    /** A rolled result of the table's die. */
    roll: z.number().int().min(1).max(100).optional(),
    /** An option picked from the list, by position. */
    optionIndex: z.number().int().min(0).max(99).optional(),
    /** Own text instead of an option. */
    customText: z.string().trim().min(1).max(1_000).optional(),
  })
  .refine(
    (selection) =>
      [selection.roll, selection.optionIndex, selection.customText].filter((value) => value !== undefined)
        .length === 1,
    { message: "A selection has a roll, an option or an own text" },
  );

/**
 * A character's choices for the background, to check and preview without storing them (the
 * character modules store the assignment). Choices are named by grant key; answers are codes, or
 * asset ids of tool items and feats.
 */
export const ResolveBackgroundSchema = z.strictObject({
  characterLevel: z.number().int().min(1).max(20).default(1),
  /** `CHOOSE_2024`: +2/+1 or +1/+1/+1 from the allowed abilities. */
  abilityAllocations: z.partialRecord(z.enum(ABILITIES), z.number().int().min(1).max(3)).default({}),
  proficiencyChoices: z.record(featureKeyDto, z.array(proficiencyValueDto).max(10)).default({}),
  /** Feat asset id per `CHOOSE` feat grant. */
  featChoices: z.record(featureKeyDto, uuidDto).default({}),
  /**
   * Feats the character already has, once per occurrence. A feat that can't be taken again is
   * refused as a choice and reported as a conflict for a fixed grant.
   */
  existingFeatAssetIds: z.array(uuidDto).max(100).default([]),
  equipmentChoice: z
    .strictObject({
      optionCode: featureKeyDto,
      /** Item asset id per choice entry of the option. */
      itemChoices: z.record(featureKeyDto, uuidDto).default({}),
    })
    .nullable()
    .default(null),
  promptSelections: z.array(PromptSelectionSchema).max(20).default([]),
  customization: BackgroundCustomizationSchema.nullable().default(null),
  /** Choices of granted features, by grant key. */
  featureChoices: z
    .array(
      z.strictObject({
        grantKey: featureKeyDto,
        choiceKey: featureKeyDto,
        values: z.array(z.string().min(1).max(100)).max(50),
      }),
    )
    .max(100)
    .default([]),
  /**
   * What the character has already; `proficiencies` as keys such as `skill.insight` or
   * `tool.<item id>`, to report duplicates as conflicts.
   */
  actor: ActorSnapshotSchema.omit({ characterLevel: true, sourceLevel: true, classLevel: true }).default({}),
});

/** What the character already has, to offer only feats it may still take. */
export const BackgroundFeatOptionsSchema = ResolveBackgroundSchema.pick({ existingFeatAssetIds: true });

export type RequestCampaignBackgroundsQueryDto = z.infer<typeof RequestCampaignBackgroundsQuerySchema>;
export type RequestBackgroundCatalogQueryDto = z.infer<typeof RequestBackgroundCatalogQuerySchema>;
export type RequestSystemBackgroundsQueryDto = z.infer<typeof RequestSystemBackgroundsQuerySchema>;
export type BackgroundCustomizationDto = z.infer<typeof BackgroundCustomizationSchema>;
export type PromptSelectionDto = z.infer<typeof PromptSelectionSchema>;
export type ResolveBackgroundDto = z.infer<typeof ResolveBackgroundSchema>;
export type BackgroundFeatOptionsDto = z.infer<typeof BackgroundFeatOptionsSchema>;
