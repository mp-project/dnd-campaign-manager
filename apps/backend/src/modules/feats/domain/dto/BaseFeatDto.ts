import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { FeatDefinitionSchema } from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import {
  FEAT_CATEGORIES,
  FEAT_DESCRIPTION_MAX_LENGTH,
  FEAT_MAX_CHARACTER_LEVEL,
  PREREQUISITE_CHECK_MODES,
} from "#src/modules/feats/domain/entities/FeatsTable";

/**
 * All feat fields with their validation rules, including the asset fields a feat shows as its own
 * (`name` is the title of the asset). Request and response DTOs derive from this schema.
 */
export const FeatBaseSchema = z
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
    description: z.string().trim().min(1).max(FEAT_DESCRIPTION_MAX_LENGTH).nullable(),
    category: z.enum(FEAT_CATEGORIES),
    /** Character level from which the feat may be taken; null for no limit. */
    minimumCharacterLevel: z.number().int().min(1).max(FEAT_MAX_CHARACTER_LEVEL).nullable(),
    prerequisiteCheckMode: z.enum(PREREQUISITE_CHECK_MODES),
    displayOrder: z.number().int().min(0).max(1_000),
    sourceReference: AssetBaseSchema.shape.sourceReference,
    rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy,
    rulesetIds: AssetBaseSchema.shape.rulesetIds,
    assetFamilyId: AssetBaseSchema.shape.assetFamilyId,
    /** Custom feats only: players of the campaign may see and choose the feat. */
    releasedToPlayers: AssetBaseSchema.shape.releasedToPlayers,
  })
  .extend(FeatDefinitionSchema.shape);

export type FeatBaseDto = z.infer<typeof FeatBaseSchema>;
