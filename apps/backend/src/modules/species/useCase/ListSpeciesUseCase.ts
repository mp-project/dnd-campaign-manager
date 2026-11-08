import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { ContentReadPurpose } from "#core/content/access";
import type { AssetsService } from "#src/modules/assets/index";
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
import type { SpeciesPage } from "#src/modules/species/domain/repository/SpeciesRepository";
import type { SpeciesService } from "#src/modules/species/service/SpeciesService";

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class SpeciesListing {
  constructor(
    private readonly speciesService: SpeciesService,
    private readonly assetsService: AssetsService,
  ) {}

  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignSpeciesQueryDto },
  ): Promise<ResponseSpeciesListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  /**
   * What the campaign may use: active global species for its ruleset and its own species (for
   * players only released ones), plus archived species the campaign still uses. Those are marked
   * `selectable: false`; they cannot be chosen anew.
   */
  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestSpeciesCatalogQueryDto },
  ): Promise<ResponseSpeciesListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "CATALOG");
  }

  async listSystem(
    context: RequestContext,
    query: RequestSystemSpeciesQueryDto,
  ): Promise<ResponseSpeciesListDto> {
    this.assetsService.assertAuthenticated(context);

    const isAdmin = isSysAdminRole(context.systemRole);
    const { db, repository } = this.speciesService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toResponse(page, isAdmin, query.limit);
  }

  /** The campaign's own entries (`MANAGE`) or what the campaign may use (`CATALOG`). */
  private async listInCampaign(
    context: RequestContext,
    campaignId: string,
    query: RequestCampaignSpeciesQueryDto | RequestSpeciesCatalogQueryDto,
    purpose: ContentReadPurpose,
  ): Promise<ResponseSpeciesListDto> {
    const access = await this.assetsService.access(context, campaignId);
    const { db, repository } = this.speciesService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: access.listWhere(purpose, {
        scope: "scope" in query ? query.scope : undefined,
        status: query.status,
      }),
    });

    return this.toResponse(page, access.isFullView, query.limit);
  }

  private baseFilter(query: RequestCampaignSpeciesQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      creatureType: query.creatureType,
      size: query.size,
      search: query.search,
    };
  }

  private async toResponse(
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

/** Custom species of a campaign. */
export class ListCampaignSpeciesUseCase {
  constructor(private readonly listing: SpeciesListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignSpeciesQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}

/** What a campaign may use: active global species for its ruleset and its own species. */
export class ListSpeciesCatalogUseCase {
  constructor(private readonly listing: SpeciesListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestSpeciesCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}

/** Global species; drafts and archived ones for administrators only. */
export class ListSystemSpeciesUseCase {
  constructor(private readonly listing: SpeciesListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSpeciesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
