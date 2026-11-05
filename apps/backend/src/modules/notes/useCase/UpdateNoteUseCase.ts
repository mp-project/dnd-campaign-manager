import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseUpdateNoteDto,
  toNoteGmResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import type { UpdateNoteDto } from "#src/modules/notes/domain/dto/UpdateNoteDto";
import { NOTE_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import { NotesService } from "#src/modules/notes/service/NotesService";

export type UpdateNoteInput = { campaignId: string; noteId: string; command: UpdateNoteDto };

export class UpdateNoteUseCase extends MutationUseCase<UpdateNoteInput, ResponseUpdateNoteDto> {
  protected readonly action = NOTE_ACTIONS.update;

  constructor(
    history: HistoryPort,
    private readonly notesService: NotesService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: UpdateNoteInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: UpdateNoteInput,
  ): Promise<ResponseUpdateNoteDto> {
    const { record, merged } = await this.notesService.updateNote(scope, {
      ...input,
      actorId: this.assetsService.assertAuthenticated(context),
    });

    return { ...toNoteGmResponse(record), merged };
  }
}
