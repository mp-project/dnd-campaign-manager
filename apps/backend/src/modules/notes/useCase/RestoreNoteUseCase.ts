import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseNoteFullDto,
  toNoteFullResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import type { NoteLifecycleCommandDto } from "#src/modules/notes/domain/dto/UpdateNoteDto";
import { NOTE_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import { NotesService } from "#src/modules/notes/service/NotesService";

export type RestoreNoteInput = {
  campaignId: string;
  noteId: string;
  command: NoteLifecycleCommandDto;
};

/** Brings back an archived note with the status it had before. */
export class RestoreNoteUseCase extends MutationUseCase<RestoreNoteInput, ResponseNoteFullDto> {
  protected readonly action = NOTE_ACTIONS.restore;

  constructor(
    history: HistoryPort,
    private readonly notesService: NotesService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: RestoreNoteInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanWrite(context, "EDIT", input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: RestoreNoteInput,
  ): Promise<ResponseNoteFullDto> {
    return toNoteFullResponse(
      await this.notesService.restoreNote(scope, {
        campaignId: input.campaignId,
        noteId: input.noteId,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
