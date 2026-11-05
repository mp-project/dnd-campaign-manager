import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService, AssetStatus } from "#src/modules/assets/index";
import type { RequestNotesQueryDto } from "#src/modules/notes/domain/dto/RequestNoteDto";
import {
  type ResponseNoteListDto,
  toNoteListItemGmResponse,
  toNoteListItemPlayerResponse,
  toNoteListResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import type { NoteListFilter } from "#src/modules/notes/domain/repository/NotesRepository";
import { NotesService } from "#src/modules/notes/service/NotesService";
import type { TagsService } from "#src/modules/tags/index";

const GM_DEFAULT_STATUSES: readonly AssetStatus[] = ["DRAFT", "ACTIVE"];

/**
 * GMs and editors see drafts and active notes, archived ones on request. Players see active notes
 * shared with them and nothing else, whatever they ask for. Entries carry no text; it comes with
 * the detail view.
 */
export class ListNotesUseCase {
  constructor(
    private readonly notesService: NotesService,
    private readonly assetsService: AssetsService,
    private readonly tagsService: TagsService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestNotesQueryDto },
  ): Promise<ResponseNoteListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const { db, repository } = this.notesService;
    const { query } = input;
    const isPlayer = viewer.view === "PLAYER";
    const filter: NoteListFilter = {
      campaignId: viewer.campaignId,
      statuses: isPlayer
        ? query.status === undefined || query.status === "ACTIVE"
          ? ["ACTIVE"]
          : []
        : query.status
          ? [query.status]
          : GM_DEFAULT_STATUSES,
      limit: query.limit,
      cursor: query.cursor,
      noteType: query.noteType,
      search: query.search,
      // Players don't see tags, so their filter by tag is ignored.
      assetIds: await this.restrictAssetIds(viewer, query.tagId),
    };
    const page = await repository.listPage(db, filter);

    if (isPlayer) {
      return toNoteListResponse({
        page,
        data: page.items.map(toNoteListItemPlayerResponse),
        limit: query.limit,
      });
    }

    const records = await this.notesService.loadRecords(db, page.items);

    return toNoteListResponse({
      page,
      data: records.map(toNoteListItemGmResponse),
      limit: query.limit,
    });
  }

  /** Assets the list is limited to: those shared with a player, or those carrying the tag. */
  private async restrictAssetIds(
    viewer: Awaited<ReturnType<AssetsService["resolveCampaignViewer"]>>,
    tagId: string | undefined,
  ): Promise<string[] | undefined> {
    if (viewer.view === "PLAYER") {
      return this.assetsService.listVisibleAssetIds(viewer);
    }

    return tagId === undefined
      ? undefined
      : this.tagsService.repository.listAssetIdsOfTag(this.tagsService.db, tagId);
  }
}
