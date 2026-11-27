import { NotFoundError } from "#core/error/http/index";
import type { RequestContext } from "#core/http/requestContext";
import type { ResponseAssetUsagesDto } from "#src/modules/asset-links/index";
import type { ItemsService } from "#src/modules/items/service/ItemsService";
import type { ItemCatalogInput, ItemReader } from "#src/modules/items/useCase/ItemReader";

/** Where an item is used in the campaign, as far as the reader may see it. */
export class GetItemUsagesUseCase {
  constructor(
    private readonly reader: ItemReader,
    private readonly itemsService: ItemsService,
    private readonly ownOnly: boolean,
  ) {}

  async execute(context: RequestContext, input: ItemCatalogInput): Promise<ResponseAssetUsagesDto> {
    const readable = await this.reader.read(context, this.ownOnly ? "campaign" : "catalog", input);

    if (!readable.access) {
      throw new NotFoundError("Item not found");
    }

    return this.itemsService.getUsages(readable.access, readable.found.asset.id);
  }
}
