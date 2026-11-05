import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { AssetBaseSchema } from "#src/modules/assets/index";
import {
  NOTE_CONTENT_FORMATS,
  NOTE_CONTENT_MAX_LENGTH,
  NOTE_GM_NOTES_MAX_LENGTH,
  NOTE_TYPES,
} from "#src/modules/notes/domain/entities/NotesTable";

/**
 * All note fields with their validation rules, including the asset fields a note shows as its own
 * (`name` is the title of the asset). Request and response DTOs derive their fields from this
 * schema via `pick`.
 */
export const NoteBaseSchema = z.strictObject({
  id: uuidDto,
  assetId: uuidDto,
  campaignId: uuidDto,
  name: AssetBaseSchema.shape.title,
  summary: AssetBaseSchema.shape.summary,
  status: AssetBaseSchema.shape.status,
  noteType: z.enum(NOTE_TYPES),
  contentFormat: z.enum(NOTE_CONTENT_FORMATS),
  /** Raw text, shown as text; only the rendered `contentHtml` of a response is HTML. */
  content: z.string().max(NOTE_CONTENT_MAX_LENGTH),
  /** Raw text for GMs and editors, never rendered as HTML. */
  gmNotes: z.string().trim().min(1).max(NOTE_GM_NOTES_MAX_LENGTH).nullable(),
  sortOrder: z.number().int().min(0).max(1_000_000),
  tagIds: z
    .array(uuidDto)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Tag ids must be unique" }),
});

export type NoteBaseDto = z.infer<typeof NoteBaseSchema>;
export type NoteType = NoteBaseDto["noteType"];
