import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import {
  type ResponseNoteDto,
  toNoteFullResponse,
  toNotePlayerResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import { NotesService } from "#src/modules/notes/service/NotesService";

/** GMs and editors get every note of the campaign, players only active notes shared with them. */
export class GetNoteUseCase {
  constructor(
    private readonly notesService: NotesService,
    private readonly assetsService: AssetsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; noteId: string },
  ): Promise<ResponseNoteDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const found = await this.notesService.requireReadableNote(access, input);

    if (!access.isFullView) {
      return toNotePlayerResponse(found);
    }

    return toNoteFullResponse(await this.notesService.loadRecord(this.notesService.db, found));
  }
}
