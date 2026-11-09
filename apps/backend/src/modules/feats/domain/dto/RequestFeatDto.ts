import { z } from "zod";

import { booleanQueryDto, paginationDto, uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { ABILITIES, ActorSnapshotSchema, featureKeyDto } from "#src/modules/features/index";
import { FeatBaseSchema } from "#src/modules/feats/domain/dto/BaseFeatDto";
import {
  FEAT_CATEGORIES,
  FEAT_MAX_CHARACTER_LEVEL,
} from "#src/modules/feats/domain/entities/FeatsTable";

export const RequestCampaignFeatsParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignFeatParamsSchema = RequestCampaignFeatsParamsSchema.extend({
  featId: uuidDto,
});

export const RequestSystemFeatParamsSchema = z.strictObject({
  featId: uuidDto,
});

/** Params of routes shared by custom and global feats; without a campaign it is global. */
export const RequestFeatScopeParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
});

export const RequestFeatParamsSchema = RequestFeatScopeParamsSchema.extend({
  featId: uuidDto,
});

const levelDto = z.coerce.number().int().min(1).max(FEAT_MAX_CHARACTER_LEVEL);

const listFilterShape = FeatBaseSchema.pick({ category: true, status: true })
  .partial()
  .extend({
    search: z.string().trim().min(1).max(200).optional(),
    /** Feats a character of this level may take by their minimum level (prerequisites aside). */
    level: levelDto.optional(),
    /** true: feats that can be taken more than once. */
    repeatable: booleanQueryDto.optional(),
  }).shape;

/** `status` only applies to GMs and editors; players always get active feats they may see. */
export const RequestCampaignFeatsQuerySchema = z
  .strictObject(listFilterShape)
  .extend(paginationDto.shape);

/** The catalog shows global feats for the campaign ruleset and the campaign's own ones. */
export const RequestFeatCatalogQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ scope: AssetBaseSchema.shape.scope.optional() })
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemFeatsQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

const choiceAnswersDto = z.record(featureKeyDto, z.array(z.string().min(1).max(100)).max(20));

/**
 * What is known about a character, for the prerequisite check. Every fact is optional: a fact
 * that is missing makes the prerequisites that need it unknown instead of failed. Until the
 * character modules exist, the client sends it; later a character id will fill it.
 */
export const FeatActorSnapshotSchema = z.strictObject({
  characterLevel: z.number().int().min(1).max(FEAT_MAX_CHARACTER_LEVEL).optional(),
  abilities: z.partialRecord(z.enum(ABILITIES), z.number().int().min(1).max(30)).optional(),
  /** Proficiency keys such as `armor.heavy` or `weapon.martial`. */
  proficiencies: z.array(z.string().trim().min(1).max(100)).max(200).optional(),
  classes: z
    .array(z.strictObject({ classAssetId: uuidDto, level: z.number().int().min(1).max(20) }))
    .max(20)
    .optional(),
  /** Species and species variants of the character. */
  speciesAssetIds: z.array(uuidDto).max(10).optional(),
  /** Feats the character has, once per occurrence, with the answers of their choices. */
  feats: z
    .array(z.strictObject({ featAssetId: uuidDto, choices: choiceAnswersDto.default({}) }))
    .max(100)
    .optional(),
  /** Whether the character can cast at least one spell (Spellcasting or Pact Magic). */
  spellcasting: z.boolean().optional(),
  /** Answers to `CUSTOM` prerequisites, by key. */
  facts: z.record(featureKeyDto, z.boolean()).optional(),
});

/**
 * Where the feat would be taken. `characterLevel` is the level the character reaches with it (it
 * replaces the one of the snapshot); `allowedCategories` the categories the slot accepts, e.g.
 * only `FIGHTING_STYLE` for a fighting style feature or `GENERAL` for an ability score improvement.
 */
export const AcquisitionContextSchema = z.strictObject({
  characterLevel: z.number().int().min(1).max(FEAT_MAX_CHARACTER_LEVEL).optional(),
  allowedCategories: z.array(z.enum(FEAT_CATEGORIES)).min(1).max(FEAT_CATEGORIES.length).optional(),
});

export const EligibilityCheckSchema = z.strictObject({
  acquisitionContext: AcquisitionContextSchema.default({}),
  actor: FeatActorSnapshotSchema.default({}),
});

/**
 * Choices of the feat and of the features it grants, to check and resolve without storing them.
 * `choices` answer the feat's own choices by key (option codes, or asset ids for filtered
 * choices); `featureChoices` answer choices of granted features by grant key.
 */
export const ResolveFeatSchema = z.strictObject({
  characterLevel: z.number().int().min(1).max(FEAT_MAX_CHARACTER_LEVEL).default(1),
  choices: choiceAnswersDto.default({}),
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
  actor: ActorSnapshotSchema.omit({ characterLevel: true, sourceLevel: true, classLevel: true }).default({}),
});

export type RequestCampaignFeatsQueryDto = z.infer<typeof RequestCampaignFeatsQuerySchema>;
export type RequestFeatCatalogQueryDto = z.infer<typeof RequestFeatCatalogQuerySchema>;
export type RequestSystemFeatsQueryDto = z.infer<typeof RequestSystemFeatsQuerySchema>;
export type FeatActorSnapshot = z.infer<typeof FeatActorSnapshotSchema>;
export type AcquisitionContext = z.infer<typeof AcquisitionContextSchema>;
export type EligibilityCheckDto = z.infer<typeof EligibilityCheckSchema>;
export type ResolveFeatDto = z.infer<typeof ResolveFeatSchema>;
