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

export type DeleteNoteInput = {
  campaignId: string;
  noteId: string;
  command: NoteLifecycleCommandDto;
};

/** Archives the note; it can be restored. Its shares end and don't come back. */
export class DeleteNoteUseCase extends MutationUseCase<DeleteNoteInput, ResponseNoteFullDto> {
  protected readonly action = NOTE_ACTIONS.delete;

  constructor(
    history: HistoryPort,
    private readonly notesService: NotesService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: DeleteNoteInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    _context: RequestContext,
    input: DeleteNoteInput,
  ): Promise<ResponseNoteFullDto> {
    return toNoteFullResponse(
      await this.notesService.archiveNote(scope, {
        campaignId: input.campaignId,
        noteId: input.noteId,
        expectedAssetVersion: input.command.expectedAssetVersion,
      }),
    );
  }
}
