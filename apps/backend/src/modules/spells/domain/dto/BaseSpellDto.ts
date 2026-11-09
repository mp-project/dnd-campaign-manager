import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import {
  SpellDefinitionSchema,
  SpellListEntriesSchema,
  SpellListIdsSchema,
} from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import {
  CASTING_TIME_TYPES,
  DURATION_TYPES,
  DURATION_UNITS,
  RANGE_TYPES,
  RANGE_UNITS,
  SPELL_MAX_LEVEL,
  SPELL_SCHOOLS,
  SPELL_TEXT_MAX_LENGTH,
  SPELL_TRIGGER_MAX_LENGTH,
} from "#src/modules/spells/domain/entities/SpellsTable";

export const spellCodeDto = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Markdown; only the rendered `…Html` fields of a response are HTML. */
const spellTextDto = z.string().trim().min(1).max(SPELL_TEXT_MAX_LENGTH);

/** Fields of the asset that spells and spell lists show as their own (`name` is its title). */
const assetShape = {
  id: uuidDto,
  assetId: uuidDto,
  campaignId: uuidDto.nullable(),
  scope: AssetBaseSchema.shape.scope,
  name: z.string().trim().min(1).max(160),
  summary: AssetBaseSchema.shape.summary,
  status: AssetBaseSchema.shape.status,
  sourceReference: AssetBaseSchema.shape.sourceReference,
  rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy,
  rulesetIds: AssetBaseSchema.shape.rulesetIds,
  assetFamilyId: AssetBaseSchema.shape.assetFamilyId,
  /** Custom content only: players of the campaign may see and use it. */
  releasedToPlayers: AssetBaseSchema.shape.releasedToPlayers,
};

/**
 * All spell fields with their validation rules, including the asset fields a spell shows as its
 * own. Request and response DTOs derive from this schema. Casting time, range, duration and the
 * components are flat fields, one per column, so the history and `merged` name them one by one.
 */
export const SpellBaseSchema = z
  .strictObject({
    ...assetShape,
    code: spellCodeDto,
    /** 0 is a cantrip. */
    level: z.number().int().min(0).max(SPELL_MAX_LEVEL),
    school: z.enum(SPELL_SCHOOLS),
    description: spellTextDto.nullable(),
    higherLevelDescription: spellTextDto.nullable(),
    isRitual: z.boolean(),
    castingTimeType: z.enum(CASTING_TIME_TYPES),
    /** Minutes or hours; 1 for actions, bonus actions and reactions. */
    castingTimeAmount: z.number().int().min(1).max(1_000),
    castingTrigger: z.string().trim().min(1).max(SPELL_TRIGGER_MAX_LENGTH).nullable(),
    rangeType: z.enum(RANGE_TYPES),
    rangeDistance: z.number().int().min(1).max(1_000_000).nullable(),
    rangeUnit: z.enum(RANGE_UNITS).nullable(),
    durationType: z.enum(DURATION_TYPES),
    durationAmount: z.number().int().min(1).max(1_000).nullable(),
    durationUnit: z.enum(DURATION_UNITS).nullable(),
    requiresConcentration: z.boolean(),
    componentVerbal: z.boolean(),
    componentSomatic: z.boolean(),
    componentMaterial: z.boolean(),
    spellListIds: SpellListIdsSchema,
  })
  .extend(SpellDefinitionSchema.shape);

export type SpellBaseDto = z.infer<typeof SpellBaseSchema>;

/** All spell list fields; its entries are the asset ids of spells. */
export const SpellListBaseSchema = z.strictObject({
  ...assetShape,
  code: spellCodeDto,
  description: spellTextDto.nullable(),
  spellIds: SpellListEntriesSchema,
});

export type SpellListBaseDto = z.infer<typeof SpellListBaseSchema>;
