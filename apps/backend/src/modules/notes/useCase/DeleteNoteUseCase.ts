import { ArchiveContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseNoteFullDto,
  toNoteFullResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import { NOTE_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import type { NoteContent } from "#src/modules/notes/service/NotesService";

/** Archives the note; it can be restored. Its shares end and don't come back. */
export class DeleteNoteUseCase extends ArchiveContentUseCase<NoteContent, ResponseNoteFullDto> {
  protected readonly action = NOTE_ACTIONS.delete;
  protected readonly toResponse = toNoteFullResponse;
}
