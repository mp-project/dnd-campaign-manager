import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { BackgroundDefinitionSchema } from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import {
  BACKGROUND_CUSTOMIZATION_MODES,
  BACKGROUND_DESCRIPTION_MAX_LENGTH,
} from "#src/modules/backgrounds/domain/entities/BackgroundsTable";

/**
 * All background fields with their validation rules, including the asset fields a background shows
 * as its own (`name` is the title of the asset). Request and response DTOs derive from this schema.
 */
export const BackgroundBaseSchema = z
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
    description: z.string().trim().min(1).max(BACKGROUND_DESCRIPTION_MAX_LENGTH).nullable(),
    customizationMode: z.enum(BACKGROUND_CUSTOMIZATION_MODES),
    displayOrder: z.number().int().min(0).max(1_000),
    sourceReference: AssetBaseSchema.shape.sourceReference,
    rulesetPolicy: AssetBaseSchema.shape.rulesetPolicy,
    rulesetIds: AssetBaseSchema.shape.rulesetIds,
    assetFamilyId: AssetBaseSchema.shape.assetFamilyId,
    /** Custom backgrounds only: players of the campaign may see and choose the background. */
    releasedToPlayers: AssetBaseSchema.shape.releasedToPlayers,
  })
  .extend(BackgroundDefinitionSchema.shape);

export type BackgroundBaseDto = z.infer<typeof BackgroundBaseSchema>;
