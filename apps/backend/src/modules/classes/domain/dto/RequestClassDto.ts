import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import { ClassBaseSchema } from "#src/modules/classes/domain/dto/BaseClassDto";
import { CASTING_TYPES } from "#src/modules/classes/domain/dto/ClassDefinitionDto";

export const RequestCampaignClassesParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignClassParamsSchema = RequestCampaignClassesParamsSchema.extend({
  classId: uuidDto,
});

export const RequestSystemClassParamsSchema = z.strictObject({
  classId: uuidDto,
});

/** Params of routes shared by custom and global classes; without a campaign it is global. */
export const RequestClassScopeParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
});

export const RequestClassParamsSchema = RequestClassScopeParamsSchema.extend({
  classId: uuidDto,
});

const listFilterShape = ClassBaseSchema.pick({ hitDie: true, status: true })
  .partial()
  .extend({
    search: z.string().trim().min(1).max(200).optional(),
    /** NONE finds classes without spellcasting. */
    spellcastingType: z.enum(CASTING_TYPES).optional(),
  }).shape;

/** `status` only applies to GMs and editors; players always get active classes they may see. */
export const RequestCampaignClassesQuerySchema = z
  .strictObject(listFilterShape)
  .extend(paginationDto.shape);

/** The catalog shows global classes for the campaign ruleset and the campaign's own ones. */
export const RequestClassCatalogQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ scope: AssetBaseSchema.shape.scope.optional() })
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemClassesQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

export type RequestCampaignClassesQueryDto = z.infer<typeof RequestCampaignClassesQuerySchema>;
export type RequestClassCatalogQueryDto = z.infer<typeof RequestClassCatalogQuerySchema>;
export type RequestSystemClassesQueryDto = z.infer<typeof RequestSystemClassesQuerySchema>;
