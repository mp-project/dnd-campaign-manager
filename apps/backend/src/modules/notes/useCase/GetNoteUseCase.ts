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
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);

    if (viewer.view === "PLAYER") {
      const visibleAssetIds = new Set(await this.assetsService.listVisibleAssetIds(viewer));

      return toNotePlayerResponse(
        await this.notesService.requireVisibleToPlayer(input, visibleAssetIds),
      );
    }

    const { db } = this.notesService;

    return toNoteFullResponse(
      await this.notesService.loadRecord(db, await this.notesService.requireNote(db, input)),
    );
  }
}
