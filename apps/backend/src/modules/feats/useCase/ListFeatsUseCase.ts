import type { ContentReadPurpose } from "#core/content/access";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
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
import type { FeatPage } from "#src/modules/feats/domain/repository/FeatsRepository";
import type { FeatsService } from "#src/modules/feats/service/FeatsService";

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class FeatListing {
  constructor(
    private readonly featsService: FeatsService,
    private readonly assetsService: AssetsService,
  ) {}

  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignFeatsQueryDto },
  ): Promise<ResponseFeatListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  /**
   * What the campaign may use: active global feats for its ruleset and its own feats (for players
   * only released ones), plus archived feats the campaign still uses, marked `selectable: false`.
   */
  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestFeatCatalogQueryDto },
  ): Promise<ResponseFeatListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "CATALOG");
  }

  async listSystem(context: RequestContext, query: RequestSystemFeatsQueryDto): Promise<ResponseFeatListDto> {
    this.assetsService.assertAuthenticated(context);

    const { db, repository } = this.featsService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toResponse(page, isSysAdminRole(context.systemRole), query.limit);
  }

  private async listInCampaign(
    context: RequestContext,
    campaignId: string,
    query: RequestCampaignFeatsQueryDto | RequestFeatCatalogQueryDto,
    purpose: ContentReadPurpose,
  ): Promise<ResponseFeatListDto> {
    const access = await this.assetsService.access(context, campaignId);
    const { db, repository } = this.featsService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: access.listWhere(purpose, {
        scope: "scope" in query ? query.scope : undefined,
        status: query.status,
      }),
    });

    return this.toResponse(page, access.isFullView, query.limit);
  }

  private baseFilter(query: RequestCampaignFeatsQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      category: query.category,
      level: query.level,
      repeatable: query.repeatable,
      search: query.search,
    };
  }

  private async toResponse(page: FeatPage, fullView: boolean, limit: number): Promise<ResponseFeatListDto> {
    if (!fullView) {
      return toFeatListResponse({ page, data: page.items.map(toFeatListItemPlayerResponse), limit });
    }

    const records = await this.featsService.loadRecords(this.featsService.db, page.items);

    return toFeatListResponse({ page, data: records.map(toFeatListItemFullResponse), limit });
  }
}

/** Custom feats of a campaign. */
export class ListCampaignFeatsUseCase {
  constructor(private readonly listing: FeatListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignFeatsQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}

/** What a campaign may use: active global feats for its ruleset and its own feats. */
export class ListFeatCatalogUseCase {
  constructor(private readonly listing: FeatListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestFeatCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}

/** Global feats; drafts and archived ones for administrators only. */
export class ListSystemFeatsUseCase {
  constructor(private readonly listing: FeatListing) {}

  execute(context: RequestContext, input: { query: RequestSystemFeatsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
