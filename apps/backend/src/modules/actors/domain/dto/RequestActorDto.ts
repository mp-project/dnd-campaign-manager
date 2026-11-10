import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { ActorBaseSchema } from "#src/modules/actors/domain/dto/BaseActorDto";

export const RequestActorsParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestActorItemParamsSchema = RequestActorsParamsSchema.extend({
  actorId: uuidDto,
});

/**
 * `search` matches name and display name. `status` and `tagId` only apply to GMs and editors;
 * players always get active actors shared with them.
 */
export const RequestActorsQuerySchema = ActorBaseSchema.pick({
  category: true,
  status: true,
  creatureType: true,
  size: true,
})
  .partial()
  .extend({
    tagId: uuidDto.optional(),
    search: z.string().trim().min(1).max(200).optional(),
  })
  .extend(paginationDto.shape);

export type RequestActorsQueryDto = z.infer<typeof RequestActorsQuerySchema>;
