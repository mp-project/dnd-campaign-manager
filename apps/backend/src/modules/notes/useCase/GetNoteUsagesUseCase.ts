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
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const isPlayer = viewer.view === "PLAYER";
    const visibleAssetIds = new Set(
      isPlayer ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    const { asset } = isPlayer
      ? await this.notesService.requireVisibleToPlayer(input, visibleAssetIds)
      : await this.notesService.requireNote(this.notesService.db, input);

    return this.linksService.getUsages(viewer, asset.id, visibleAssetIds);
  }
}
