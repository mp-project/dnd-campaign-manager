import type { SQL } from "drizzle-orm";

import { type AssetsService, ContentListing } from "#src/modules/assets/index";
import type {
  RequestBackgroundCatalogQueryDto,
  RequestCampaignBackgroundsQueryDto,
  RequestSystemBackgroundsQueryDto,
} from "#src/modules/backgrounds/domain/dto/RequestBackgroundDto";
import {
  type ResponseBackgroundListDto,
  toBackgroundListItemFullResponse,
  toBackgroundListItemPlayerResponse,
  toBackgroundListResponse,
} from "#src/modules/backgrounds/domain/dto/ResponseBackgroundDto";
import type {
  BackgroundListFilter,
  BackgroundPage,
} from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

/** The types of the background lists for `ContentListing`. */
type BackgroundListTypes = {
  campaignQuery: RequestCampaignBackgroundsQueryDto;
  catalogQuery: RequestBackgroundCatalogQueryDto;
  systemQuery: RequestSystemBackgroundsQueryDto;
  filter: Omit<BackgroundListFilter, "where">;
  page: BackgroundPage;
  response: ResponseBackgroundListDto;
};

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class BackgroundListing extends ContentListing<BackgroundListTypes> {
  constructor(
    private readonly backgroundsService: BackgroundsService,
    assetsService: AssetsService,
  ) {
    super(assetsService);
  }

  protected filterOf(query: RequestCampaignBackgroundsQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      customizationMode: query.customizationMode,
      abilityMode: query.abilityMode,
      ability: query.ability,
      search: query.search,
    };
  }

  protected listPage(filter: BackgroundListTypes["filter"] & { where: SQL }): Promise<BackgroundPage> {
    return this.backgroundsService.repository.listPage(this.backgroundsService.db, filter);
  }

  protected async toResponse(
    page: BackgroundPage,
    fullView: boolean,
    limit: number,
  ): Promise<ResponseBackgroundListDto> {
    if (!fullView) {
      return toBackgroundListResponse({
        page,
        data: page.items.map(toBackgroundListItemPlayerResponse),
        limit,
      });
    }

    const records = await this.backgroundsService.loadRecords(this.backgroundsService.db, page.items);

    return toBackgroundListResponse({ page, data: records.map(toBackgroundListItemFullResponse), limit });
  }
}
