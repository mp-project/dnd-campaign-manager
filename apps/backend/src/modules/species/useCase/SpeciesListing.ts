import type { SQL } from "drizzle-orm";

import { type AssetsService, ContentListing } from "#src/modules/assets/index";
import type {
  RequestCampaignSpeciesQueryDto,
  RequestSpeciesCatalogQueryDto,
  RequestSystemSpeciesQueryDto,
} from "#src/modules/species/domain/dto/RequestSpeciesDto";
import {
  type ResponseSpeciesListDto,
  toSpeciesListItemFullResponse,
  toSpeciesListItemPlayerResponse,
  toSpeciesListResponse,
} from "#src/modules/species/domain/dto/ResponseSpeciesDto";
import type {
  SpeciesListFilter,
  SpeciesPage,
} from "#src/modules/species/domain/repository/SpeciesRepository";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";

/** The types of the species lists for `ContentListing`. */
type SpeciesListTypes = {
  campaignQuery: RequestCampaignSpeciesQueryDto;
  catalogQuery: RequestSpeciesCatalogQueryDto;
  systemQuery: RequestSystemSpeciesQueryDto;
  filter: Omit<SpeciesListFilter, "where">;
  page: SpeciesPage;
  response: ResponseSpeciesListDto;
};

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class SpeciesListing extends ContentListing<SpeciesListTypes> {
  constructor(
    private readonly speciesService: SpeciesService,
    assetsService: AssetsService,
  ) {
    super(assetsService);
  }

  protected filterOf(query: RequestCampaignSpeciesQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      creatureType: query.creatureType,
      size: query.size,
      search: query.search,
    };
  }

  protected listPage(filter: SpeciesListTypes["filter"] & { where: SQL }): Promise<SpeciesPage> {
    return this.speciesService.repository.listPage(this.speciesService.db, filter);
  }

  protected async toResponse(
    page: SpeciesPage,
    fullView: boolean,
    limit: number,
  ): Promise<ResponseSpeciesListDto> {
    if (!fullView) {
      return toSpeciesListResponse({
        page,
        data: page.items.map(toSpeciesListItemPlayerResponse),
        limit,
      });
    }

    const records = await this.speciesService.loadRecords(this.speciesService.db, page.items);

    return toSpeciesListResponse({ page, data: records.map(toSpeciesListItemFullResponse), limit });
  }
}
