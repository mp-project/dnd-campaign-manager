import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { ActorSnapshotSchema, featureKeyDto } from "#src/modules/features/index";
import { SpeciesBaseSchema } from "#src/modules/species/domain/dto/BaseSpeciesDto";
import {
  SPECIES_MAX_CHARACTER_LEVEL,
  SPECIES_SIZES,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";

export const RequestCampaignSpeciesListParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignSpeciesParamsSchema = RequestCampaignSpeciesListParamsSchema.extend({
  speciesId: uuidDto,
});

export const RequestSystemSpeciesParamsSchema = z.strictObject({
  speciesId: uuidDto,
});

/** Params of routes shared by custom and global species; without a campaign it is global. */
export const RequestSpeciesParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
  speciesId: uuidDto,
});

export const RequestSpeciesVariantParamsSchema = RequestSpeciesParamsSchema.extend({
  variantId: uuidDto,
});

const listFilterShape = SpeciesBaseSchema.pick({ creatureType: true, status: true })
  .partial()
  .extend({
    search: z.string().trim().min(1).max(200).optional(),
    /** Species that are offered in this size. */
    size: z.enum(SPECIES_SIZES).optional(),
  }).shape;

/** `status` only applies to GMs and editors; players always get active species they may see. */
export const RequestCampaignSpeciesQuerySchema = z
  .strictObject(listFilterShape)
  .extend(paginationDto.shape);

/** The catalog shows global species for the campaign ruleset and the campaign's own ones. */
export const RequestSpeciesCatalogQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ scope: AssetBaseSchema.shape.scope.optional() })
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemSpeciesQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

/**
 * A character's choice of species, to check and resolve without storing it. The species comes
 * from the route. Without `size` the default size applies. `choices` answer choices of granted
 * features, by grant key; `actor` fills context values such as ability scores.
 */
export const SpeciesSelectionSchema = z.strictObject({
  variantAssetIds: z.array(uuidDto).max(20).default([]),
  size: z.enum(SPECIES_SIZES).optional(),
  characterLevel: z.number().int().min(1).max(SPECIES_MAX_CHARACTER_LEVEL).default(1),
  choices: z
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

export type RequestCampaignSpeciesQueryDto = z.infer<typeof RequestCampaignSpeciesQuerySchema>;
export type RequestSpeciesCatalogQueryDto = z.infer<typeof RequestSpeciesCatalogQuerySchema>;
export type RequestSystemSpeciesQueryDto = z.infer<typeof RequestSystemSpeciesQuerySchema>;
export type SpeciesSelectionDto = z.infer<typeof SpeciesSelectionSchema>;
