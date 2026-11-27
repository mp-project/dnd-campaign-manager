import { CreateContentUseCase } from "#src/modules/assets/index";
import {
  type ResponseNoteFullDto,
  toNoteFullResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import { NOTE_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import type { NoteContent } from "#src/modules/notes/service/NotesService";

/** Creates the note with its asset, tags and related links in one action. */
export class CreateNoteUseCase extends CreateContentUseCase<NoteContent, ResponseNoteFullDto> {
  protected readonly action = NOTE_ACTIONS.create;
  protected readonly toResponse = toNoteFullResponse;
}
