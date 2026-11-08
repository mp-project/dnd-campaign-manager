import type { RequestContext } from "#core/http/requestContext";
import type { AssetLinksService, ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";
import { NotesService } from "#src/modules/notes/service/NotesService";

/**
 * Where the note is used: links, shares and placements from other modules. Players only see usages
 * whose other end they may see as well.
 */
export class GetNoteUsagesUseCase {
  constructor(
    private readonly notesService: NotesService,
    private readonly assetsService: AssetsService,
    private readonly linksService: AssetLinksService,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; noteId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { asset } = await this.notesService.requireReadableNote(access, input);

    return this.linksService.getUsages(access, asset.id);
  }
}
