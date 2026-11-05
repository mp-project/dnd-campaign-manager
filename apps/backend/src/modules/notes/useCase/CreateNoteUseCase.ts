import type { AppDatabase } from "#core/db/pool";
import { authorized, type Authorization } from "#core/history/authorization";
import { MutationUseCase } from "#core/history/MutationUseCase";
import type { ActionScope, HistoryPort } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { CreateNoteDto } from "#src/modules/notes/domain/dto/CreateNoteDto";
import {
  type ResponseNoteGmDto,
  toNoteGmResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import { NOTE_ACTIONS } from "#src/modules/notes/history/TrackedNote";
import { NotesService } from "#src/modules/notes/service/NotesService";

export type CreateNoteInput = { campaignId: string; command: CreateNoteDto };

export class CreateNoteUseCase extends MutationUseCase<CreateNoteInput, ResponseNoteGmDto> {
  protected readonly action = NOTE_ACTIONS.create;

  constructor(
    history: HistoryPort,
    private readonly notesService: NotesService,
    private readonly assetsService: AssetsService,
  ) {
    super(history);
  }

  protected async authorize(
    context: RequestContext,
    input: CreateNoteInput,
    db: AppDatabase,
  ): Promise<Authorization> {
    await this.assetsService.assertCanEditCampaignContent(context, input.campaignId, db);

    return authorized();
  }

  protected async perform(
    scope: ActionScope,
    context: RequestContext,
    input: CreateNoteInput,
  ): Promise<ResponseNoteGmDto> {
    return toNoteGmResponse(
      await this.notesService.createNote(
        scope,
        {
          actorId: this.assetsService.assertAuthenticated(context),
          campaignId: input.campaignId,
        },
        input.command,
      ),
    );
  }
}
