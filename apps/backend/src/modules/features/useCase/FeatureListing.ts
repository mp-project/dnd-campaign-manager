import type { SQL } from "drizzle-orm";

import { type AssetsService, ContentListing } from "#src/modules/assets/index";
import type {
  RequestCampaignFeaturesQueryDto,
  RequestFeatureCatalogQueryDto,
  RequestSystemFeaturesQueryDto,
} from "#src/modules/features/domain/dto/RequestFeatureDto";
import {
  type ResponseFeatureListDto,
  toFeatureListItemFullResponse,
  toFeatureListItemPlayerResponse,
  toFeatureListResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import type {
  FeatureListFilter,
  FeaturePage,
} from "#src/modules/features/domain/repository/FeaturesRepository";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

/** The types of the feature lists for `ContentListing`. */
type FeatureListTypes = {
  campaignQuery: RequestCampaignFeaturesQueryDto;
  catalogQuery: RequestFeatureCatalogQueryDto;
  systemQuery: RequestSystemFeaturesQueryDto;
  filter: Omit<FeatureListFilter, "where">;
  page: FeaturePage;
  response: ResponseFeatureListDto;
};

/**
 * Shared by the list use cases. Lists carry no definitions; those come with the detail view.
 */
export class FeatureListing extends ContentListing<FeatureListTypes> {
  constructor(
    private readonly featuresService: FeaturesService,
    assetsService: AssetsService,
  ) {
    super(assetsService);
  }

  protected filterOf(query: RequestCampaignFeaturesQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      featureType: query.featureType,
      search: query.search,
    };
  }

  protected listPage(filter: FeatureListTypes["filter"] & { where: SQL }): Promise<FeaturePage> {
    return this.featuresService.repository.listPage(this.featuresService.db, filter);
  }

  protected async toResponse(
    page: FeaturePage,
    fullView: boolean,
    limit: number,
  ): Promise<ResponseFeatureListDto> {
    if (!fullView) {
      return toFeatureListResponse({
        page,
        data: page.items.map(toFeatureListItemPlayerResponse),
        limit,
      });
    }

    const records = await this.featuresService.loadRecords(this.featuresService.db, page.items);

    return toFeatureListResponse({ page, data: records.map(toFeatureListItemFullResponse), limit });
  }
}
