import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";
import type { FeatCatalogInput, FeatReader } from "#src/modules/feats/useCase/FeatReader";

/**
 * Where a feat is used in the current campaign: links and content that refers to it, such as
 * other feats that require it. Players only see usages whose other end they may see as well.
 * `ownOnly` limits it to custom feats, for the route under `/feats`.
 */
export class GetFeatUsagesUseCase {
  constructor(
    private readonly reader: FeatReader,
    private readonly featsService: FeatsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(context: RequestContext, input: FeatCatalogInput): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Feat not found");
    }

    return this.featsService.getUsages(readable.access, readable.found.asset.id);
  }
}
