import { z } from "zod";

import { CreateAssetLinkSchema } from "#src/modules/asset-links/index";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { NoteBaseSchema } from "#src/modules/notes/domain/dto/BaseNoteDto";

/**
 * Asset, note, tags and links are created in one transaction. Links start at the new note; they
 * are changed later through the asset-links routes.
 */
export const CreateNoteSchema = NoteBaseSchema.pick({
  name: true,
  noteType: true,
  content: true,
}).extend({
  summary: NoteBaseSchema.shape.summary.optional(),
  status: AssetEditableStatusSchema.default("ACTIVE"),
  contentFormat: NoteBaseSchema.shape.contentFormat.default("MARKDOWN"),
  gmNotes: NoteBaseSchema.shape.gmNotes.optional(),
  sortOrder: NoteBaseSchema.shape.sortOrder.optional(),
  tagIds: NoteBaseSchema.shape.tagIds.optional(),
  relatedLinks: z.array(CreateAssetLinkSchema).max(50).optional(),
});

export type CreateNoteDto = z.infer<typeof CreateNoteSchema>;
