import type { SQL } from "drizzle-orm";

import { type AssetsService, ContentListing } from "#src/modules/assets/index";
import type {
  RequestCampaignFeatsQueryDto,
  RequestFeatCatalogQueryDto,
  RequestSystemFeatsQueryDto,
} from "#src/modules/feats/domain/dto/RequestFeatDto";
import {
  type ResponseFeatListDto,
  toFeatListItemFullResponse,
  toFeatListItemPlayerResponse,
  toFeatListResponse,
} from "#src/modules/feats/domain/dto/ResponseFeatDto";
import type { FeatListFilter, FeatPage } from "#src/modules/feats/domain/repository/FeatsRepository";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

/** The types of the feat lists for `ContentListing`. */
type FeatListTypes = {
  campaignQuery: RequestCampaignFeatsQueryDto;
  catalogQuery: RequestFeatCatalogQueryDto;
  systemQuery: RequestSystemFeatsQueryDto;
  filter: Omit<FeatListFilter, "where">;
  page: FeatPage;
  response: ResponseFeatListDto;
};

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class FeatListing extends ContentListing<FeatListTypes> {
  constructor(
    private readonly featsService: FeatsService,
    assetsService: AssetsService,
  ) {
    super(assetsService);
  }

  protected filterOf(query: RequestCampaignFeatsQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      category: query.category,
      level: query.level,
      repeatable: query.repeatable,
      search: query.search,
    };
  }

  protected listPage(filter: FeatListTypes["filter"] & { where: SQL }): Promise<FeatPage> {
    return this.featsService.repository.listPage(this.featsService.db, filter);
  }

  protected async toResponse(page: FeatPage, fullView: boolean, limit: number): Promise<ResponseFeatListDto> {
    if (!fullView) {
      return toFeatListResponse({ page, data: page.items.map(toFeatListItemPlayerResponse), limit });
    }

    const records = await this.featsService.loadRecords(this.featsService.db, page.items);

    return toFeatListResponse({ page, data: records.map(toFeatListItemFullResponse), limit });
  }
}
