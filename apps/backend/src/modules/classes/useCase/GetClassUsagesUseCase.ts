import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

/**
 * Where a class is used in the current campaign: links and definitions that refer to it. Players
 * only see usages whose other end they may see as well. `ownOnly` limits it to custom classes, for
 * the route under `/classes`; the catalog route also answers for global classes.
 */
export class GetClassUsagesUseCase {
  constructor(
    private readonly classesService: ClassesService,
    private readonly assetsService: AssetsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; classId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, input.campaignId);
    const visibleAssetIds = new Set(
      viewer.view === "PLAYER" ? await this.assetsService.listVisibleAssetIds(viewer) : [],
    );
    const { characterClass, asset } = await this.classesService.requireCatalogClass(
      viewer,
      input.classId,
      {
        visibleAssetIds,
        inUseAssetIds: await this.assetsService.listInUseAssetIds(viewer.campaignId),
        archived: this.ownOnly ? "always" : "ifInUse",
      },
    );

    if (this.ownOnly && characterClass.campaignId !== viewer.campaignId) {
      throw new NotFoundError("Class not found");
    }

    return this.classesService.getUsages(viewer, asset.id, visibleAssetIds);
  }
}
