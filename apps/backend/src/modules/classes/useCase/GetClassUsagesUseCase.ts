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
    const access = await this.assetsService.access(context, input.campaignId);
    const { asset } = await this.classesService.requireReadableClass(
      access,
      input.classId,
      this.ownOnly ? "MANAGE" : "CATALOG",
    );

    return this.classesService.getUsages(access, asset.id);
  }
}
