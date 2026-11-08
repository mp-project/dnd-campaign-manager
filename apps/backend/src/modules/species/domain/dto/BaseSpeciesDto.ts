import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { featureKeyDto } from "#src/modules/features/index";
import {
  SpeciesDefinitionSchema,
  SpeciesFeatureGrantsSchema,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import {
  CREATURE_TYPES,
  LIFESPAN_MODES,
  SPECIES_DESCRIPTION_MAX_LENGTH,
} from "#src/modules/species/domain/entities/SpeciesTable";

const codeDto = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** Markdown; only the rendered `descriptionHtml` of a response is HTML. */
const descriptionDto = z.string().trim().min(1).max(SPECIES_DESCRIPTION_MAX_LENGTH).nullable();

/** Asset fields a species or variant shows as its own (`name` is the title of the asset). */
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
  /** Custom content only: players of the campaign may see and choose it. */
  releasedToPlayers: AssetBaseSchema.shape.releasedToPlayers,
};

/** All species fields with their validation rules. Request and response DTOs derive from this schema. */
export const SpeciesBaseSchema = z
  .strictObject({
    ...assetShape,
    code: codeDto,
    description: descriptionDto,
    creatureType: z.enum(CREATURE_TYPES),
    lifespanMode: z.enum(LIFESPAN_MODES),
    displayOrder: z.number().int().min(0).max(1_000),
  })
  .extend(SpeciesDefinitionSchema.shape);

/** All variant fields with their validation rules. */
export const SpeciesVariantBaseSchema = z.strictObject({
  ...assetShape,
  speciesId: uuidDto,
  speciesAssetId: uuidDto,
  variantGroupCode: featureKeyDto,
  code: codeDto,
  description: descriptionDto,
  displayOrder: z.number().int().min(0).max(1_000),
  featureGrants: SpeciesFeatureGrantsSchema,
});

export type SpeciesBaseDto = z.infer<typeof SpeciesBaseSchema>;
export type SpeciesVariantBaseDto = z.infer<typeof SpeciesVariantBaseSchema>;
export type CreatureType = SpeciesBaseDto["creatureType"];
