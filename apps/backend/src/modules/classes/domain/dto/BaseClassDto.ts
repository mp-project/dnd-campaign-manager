import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { ClassDefinitionSchema } from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import {
  CLASS_DESCRIPTION_MAX_LENGTH,
  CLASS_HIT_DICE,
  CLASS_MAX_LEVEL,
} from "#src/modules/classes/domain/entities/ClassesTable";

const classLevelDto = z.number().int().min(1).max(CLASS_MAX_LEVEL);
const hitPointsDto = z.number().int().min(1).max(100);

/**
 * All class fields with their validation rules, including the asset fields a class shows as its own
 * (`name` is the title of the asset). Request and response DTOs derive from this schema.
 */
export const ClassBaseSchema = z
  .strictObject({
    id: uuidDto,
    assetId: uuidDto,
    campaignId: uuidDto.nullable(),
    scope: AssetBaseSchema.shape.scope,
    name: z.string().trim().min(1).max(160),
    summary: AssetBaseSchema.shape.summary,
    status: AssetBaseSchema.shape.status,
    code: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    /** Markdown; only the rendered `descriptionHtml` of a response is HTML. */
    description: z.string().trim().min(1).max(CLASS_DESCRIPTION_MAX_LENGTH).nullable(),
    maximumLevel: classLevelDto,
    hitDie: z.enum(CLASS_HIT_DICE),
    firstLevelHitPoints: hitPointsDto,
    fixedHitPointsPerLevel: hitPointsDto,
    subclassSelectionLevel: classLevelDto,
    displayOrder: z.number().int().min(0).max(1_000),
    sourceReference: AssetBaseSchema.shape.sourceReference,
    rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy,
    rulesetIds: AssetBaseSchema.shape.rulesetIds,
    assetFamilyId: AssetBaseSchema.shape.assetFamilyId,
    /** Custom classes only: players of the campaign may see and choose the class. */
    releasedToPlayers: AssetBaseSchema.shape.releasedToPlayers,
  })
  .extend(ClassDefinitionSchema.shape);

export type ClassBaseDto = z.infer<typeof ClassBaseSchema>;
export type ClassHitDie = ClassBaseDto["hitDie"];
