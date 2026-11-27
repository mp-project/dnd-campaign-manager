import { UpdateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseNoteFullDto,
  toNoteFullResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import { NOTE_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import type { NoteContent } from "#src/modules/notes/service/NotesService";

/** Changes the note, its asset fields and tags; `merged` names the fields that kept a newer value. */
export class UpdateNoteUseCase extends UpdateContentUseCase<NoteContent, ResponseNoteFullDto> {
  protected readonly action = NOTE_ACTIONS.update;
  protected readonly toResponse = toNoteFullResponse;
}
