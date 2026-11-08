import type { RequestContext } from "#core/http/requestContext";
import type { AssetsService } from "#src/modules/assets/index";
import type { RequestNotesQueryDto } from "#src/modules/notes/domain/dto/RequestNoteDto";
import {
  type ResponseNoteListDto,
  toNoteListItemFullResponse,
  toNoteListItemPlayerResponse,
  toNoteListResponse,
} from "#src/modules/notes/domain/dto/ResponseNoteDto";
import type { NoteListFilter } from "#src/modules/notes/domain/repository/NotesRepository";
import { NotesService } from "#src/modules/notes/service/NotesService";
import type { TagsService } from "#src/modules/tags/index";


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
    const access = await this.assetsService.access(context, input.campaignId);
    const { db, repository } = this.notesService;
    const { query } = input;
    const isPlayer = !access.isFullView;
    const filter: NoteListFilter = {
      where: access.listWhere("MANAGE", { status: query.status }),
      limit: query.limit,
      cursor: query.cursor,
      noteType: query.noteType,
      search: query.search,
      // Players don't see tags, so their filter by tag is ignored.
      assetIds:
        isPlayer || query.tagId === undefined
          ? undefined
          : await this.tagsService.repository.listAssetIdsOfTag(this.tagsService.db, query.tagId),
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
      data: records.map(toNoteListItemFullResponse),
      limit: query.limit,
    });
  }
}
