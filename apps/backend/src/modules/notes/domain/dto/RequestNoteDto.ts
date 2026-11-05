import { z } from "zod";

import { paginationDto, uuidDto } from "#core/http/dto";
import { NoteBaseSchema } from "#src/modules/notes/domain/dto/BaseNoteDto";

export const RequestNotesParamsSchema = z.strictObject({
  campaignId: uuidDto,
});

export const RequestNoteItemParamsSchema = RequestNotesParamsSchema.extend({
  noteId: uuidDto,
});

/** `status` only applies to GMs and editors; players always get active notes shared with them. */
export const RequestNotesQuerySchema = NoteBaseSchema.pick({ noteType: true, status: true })
  .partial()
  .extend({
    tagId: uuidDto.optional(),
    search: z.string().trim().min(1).max(200).optional(),
  })
  .extend(paginationDto.shape);

export type RequestNotesQueryDto = z.infer<typeof RequestNotesQuerySchema>;
