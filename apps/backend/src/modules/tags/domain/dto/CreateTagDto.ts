import { z } from "zod";

import { TagBaseSchema } from "#src/modules/tags/domain/dto/BaseTagDto";

export const CreateTagSchema = TagBaseSchema.pick({ name: true }).extend({
  color: TagBaseSchema.shape.color.optional(),
  description: TagBaseSchema.shape.description.optional(),
  sortOrder: TagBaseSchema.shape.sortOrder.optional(),
});

export type CreateTagDto = z.infer<typeof CreateTagSchema>;
