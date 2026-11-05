import { z } from "zod";

import { isoDateTimeDto, paginationDto, uuidDto } from "#core/http/dto";

export const RequestContentSharesParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestContentShareItemParamsSchema = RequestContentSharesParamsSchema.extend({
  shareId: uuidDto,
});

export const RequestContentSharesQuerySchema = paginationDto.extend({
  /** Only shares revealed to the viewer after this point, for the popup of new shares. */
  since: isoDateTimeDto.optional(),
});

export type RequestContentSharesQueryDto = z.infer<typeof RequestContentSharesQuerySchema>;
