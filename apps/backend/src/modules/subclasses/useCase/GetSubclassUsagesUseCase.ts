import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { AssetsService } from "#src/modules/assets/index";
import type { SubclassesService } from "#src/modules/subclasses/service/SubclassesService";

/**
 * Where a subclass is used in the current campaign: links and content that refers to it. Players
 * only see usages whose other end they may see as well. `ownOnly` limits it to custom subclasses,
 * for the route under `/subclasses`; the catalog route also answers for global ones.
 */
export class GetSubclassUsagesUseCase {
  constructor(
    private readonly subclassesService: SubclassesService,
    private readonly assetsService: AssetsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(
    context: RequestContext,
    input: { campaignId: string; subclassId: string },
  ): Promise<ResponseAssetUsagesDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const { asset } = await this.subclassesService.requireReadableSubclass(
      access,
      input.subclassId,
      this.ownOnly ? "MANAGE" : "CATALOG",
    );

    return this.subclassesService.getUsages(access, asset.id);
  }
}
