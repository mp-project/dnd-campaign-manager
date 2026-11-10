import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { CLASS_MAX_LEVEL } from "#src/modules/classes/index";
import { SubclassBaseSchema } from "#src/modules/subclasses/domain/dto/BaseSubclassDto";

export const RequestCampaignSubclassesParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestCampaignSubclassParamsSchema = RequestCampaignSubclassesParamsSchema.extend({
  subclassId: uuidDto,
});

export const RequestCatalogClassSubclassesParamsSchema = RequestCampaignSubclassesParamsSchema.extend({
  classId: uuidDto,
});

export const RequestSystemSubclassParamsSchema = z.strictObject({
  subclassId: uuidDto,
});

/** Params of routes shared by custom and global subclasses; without a campaign it is global. */
export const RequestSubclassScopeParamsSchema = z.strictObject({
  campaignId: uuidDto.optional(),
});

export const RequestSubclassParamsSchema = RequestSubclassScopeParamsSchema.extend({
  subclassId: uuidDto,
});

const listFilterShape = SubclassBaseSchema.pick({ classId: true, status: true })
  .partial()
  .extend({ search: z.string().trim().min(1).max(200).optional() }).shape;

/** `status` only applies to GMs and editors; players always get active subclasses they may see. */
export const RequestCampaignSubclassesQuerySchema = z
  .strictObject(listFilterShape)
  .extend(paginationDto.shape);

/** `status` other than ACTIVE only applies to administrators. */
export const RequestSystemSubclassesQuerySchema = z
  .strictObject(listFilterShape)
  .extend({ rulesetId: uuidDto.optional() })
  .extend(paginationDto.shape);

/**
 * Whether a class assignment of a character may take the subclass: the class of the assignment,
 * its level and the subclass it already has, if any. Nothing is stored; the actor progression
 * stores the choice on the assignment.
 */
export const RequestSubclassSelectionCheckSchema = z.strictObject({
  classId: uuidDto,
  classLevel: z.number().int().min(1).max(CLASS_MAX_LEVEL),
  currentSubclassId: uuidDto.nullable().default(null),
});

export type RequestCampaignSubclassesQueryDto = z.infer<typeof RequestCampaignSubclassesQuerySchema>;
export type RequestSystemSubclassesQueryDto = z.infer<typeof RequestSystemSubclassesQuerySchema>;
export type RequestSubclassSelectionCheckDto = z.infer<typeof RequestSubclassSelectionCheckSchema>;
