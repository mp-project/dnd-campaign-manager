import type { SQL } from "drizzle-orm";

import { type AssetsService, ContentListing } from "#src/modules/assets/index";
import type {
  RequestCampaignItemsQueryDto,
  RequestItemCatalogQueryDto,
  RequestSystemItemsQueryDto,
} from "#src/modules/items/domain/dto/RequestItemDto";
import {
  type ResponseItemListDto,
  toItemListItemFullResponse,
  toItemListItemPlayerResponse,
  toItemPageResponse,
} from "#src/modules/items/domain/dto/ResponseItemDto";
import type { ItemListFilter, ItemPage } from "#src/modules/items/domain/repository/ItemsRepository";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

/** The types of the item lists for `ContentListing`. */
type ItemListTypes = {
  campaignQuery: RequestCampaignItemsQueryDto;
  catalogQuery: RequestItemCatalogQueryDto;
  systemQuery: RequestSystemItemsQueryDto;
  filter: Omit<ItemListFilter, "where">;
  page: ItemPage;
  response: ResponseItemListDto;
};

/** Shared by the list use cases. Lists carry no details; those come with the detail view. */
export class ItemListing extends ContentListing<ItemListTypes> {
  constructor(
    private readonly itemsService: ItemsService,
    assetsService: AssetsService,
  ) {
    super(assetsService);
  }

  protected filterOf(query: RequestCampaignItemsQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      category: query.category,
      rarity: query.rarity,
      weaponCategory: query.weaponCategory,
      armorCategory: query.armorCategory,
      magical: query.magical,
      attunement: query.attunement,
      effect: query.effect,
      search: query.search,
    };
  }

  protected listPage(filter: ItemListTypes["filter"] & { where: SQL }): Promise<ItemPage> {
    return this.itemsService.repository.listPage(this.itemsService.db, filter);
  }

  protected async toResponse(page: ItemPage, fullView: boolean, limit: number): Promise<ResponseItemListDto> {
    if (!fullView) {
      return toItemPageResponse({ page, data: page.items.map(toItemListItemPlayerResponse), limit });
    }

    const records = await this.itemsService.loadRecords(this.itemsService.db, page.items);

    return toItemPageResponse({ page, data: records.map(toItemListItemFullResponse), limit });
  }
}
