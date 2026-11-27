import type { ContentReadPurpose } from "#core/content/access";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
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
import type { ItemPage } from "#src/modules/items/domain/repository/ItemsRepository";
import type { ItemsService } from "#src/modules/items/service/ItemsService";

/** Shared by the list use cases. Lists carry no details; those come with the detail view. */
export class ItemListing {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly assetsService: AssetsService,
  ) {}

  async listInCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignItemsQueryDto & Partial<Pick<RequestItemCatalogQueryDto, "scope">> },
    purpose: ContentReadPurpose,
  ): Promise<ResponseItemListDto> {
    const access = await this.assetsService.access(context, input.campaignId);
    const page = await this.itemsService.repository.listPage(this.itemsService.db, {
      ...this.baseFilter(input.query),
      where: access.listWhere(purpose, { scope: input.query.scope, status: input.query.status }),
    });

    return this.toResponse(page, access.isFullView, input.query.limit);
  }

  async listSystem(context: RequestContext, query: RequestSystemItemsQueryDto): Promise<ResponseItemListDto> {
    this.assetsService.assertAuthenticated(context);

    const page = await this.itemsService.repository.listPage(this.itemsService.db, {
      ...this.baseFilter(query),
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toResponse(page, isSysAdminRole(context.systemRole), query.limit);
  }

  private baseFilter(query: RequestCampaignItemsQueryDto) {
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

  private async toResponse(page: ItemPage, fullView: boolean, limit: number): Promise<ResponseItemListDto> {
    if (!fullView) {
      return toItemPageResponse({ page, data: page.items.map(toItemListItemPlayerResponse), limit });
    }

    const records = await this.itemsService.loadRecords(this.itemsService.db, page.items);

    return toItemPageResponse({ page, data: records.map(toItemListItemFullResponse), limit });
  }
}
