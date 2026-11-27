import { RestoreContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseNoteFullDto,
  toNoteFullResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import { NOTE_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import type { NoteContent } from "#src/modules/notes/service/NotesService";

/** Brings back an archived note with the status it had before. */
export class RestoreNoteUseCase extends RestoreContentUseCase<NoteContent, ResponseNoteFullDto> {
  protected readonly action = NOTE_ACTIONS.restore;
  protected readonly toResponse = toNoteFullResponse;
}
