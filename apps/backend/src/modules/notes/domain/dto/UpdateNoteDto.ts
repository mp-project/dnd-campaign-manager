import { z } from "zod";

import { expectedVersionDto } from "#core/http/dto";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";
import { NoteBaseSchema } from "#src/modules/notes/domain/dto/BaseNoteDto";

/** `expectedAssetVersion` is the version of the asset, which holds name, summary, status and tags. */
export const expectedAssetVersionDto = z.strictObject({
  expectedAssetVersion: z.coerce.number().int().positive(),
});

/**
 * Both versions come from the last response. Fields somebody else changed in the meantime are
 * compared one by one, so only a change of the same field is a conflict (412).
 */
export const UpdateNoteSchema = NoteBaseSchema.pick({
  name: true,
  summary: true,
  noteType: true,
  contentFormat: true,
  content: true,
  gmNotes: true,
  sortOrder: true,
  tagIds: true,
})
  .extend({ status: AssetEditableStatusSchema })
  .partial()
  .extend(expectedVersionDto.shape)
  .extend(expectedAssetVersionDto.shape)
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, fieldValue]) =>
          key !== "expectedVersion" && key !== "expectedAssetVersion" && fieldValue !== undefined,
      ),
    { message: "At least one field must be provided for patch updates" },
  );

/** Deleting archives the asset and restoring brings it back, so both use the asset version. */
export const NoteLifecycleCommandSchema = expectedAssetVersionDto;

export type UpdateNoteDto = z.infer<typeof UpdateNoteSchema>;
export type NoteLifecycleCommandDto = z.infer<typeof NoteLifecycleCommandSchema>;
