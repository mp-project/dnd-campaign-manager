import type { ContentReadPurpose } from "#core/content/access";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService } from "#src/modules/assets/index";
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
import type { BackgroundPage } from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import type { BackgroundsService } from "#src/modules/backgrounds/service/BackgroundsService";

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class BackgroundListing {
  constructor(
    private readonly backgroundsService: BackgroundsService,
    private readonly assetsService: AssetsService,
  ) {}

  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignBackgroundsQueryDto },
  ): Promise<ResponseBackgroundListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  /**
   * What the campaign may use: active global backgrounds for its ruleset and its own backgrounds
   * (for players only released ones), plus archived ones the campaign still uses, marked
   * `selectable: false`.
   */
  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestBackgroundCatalogQueryDto },
  ): Promise<ResponseBackgroundListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "CATALOG");
  }

  async listSystem(
    context: RequestContext,
    query: RequestSystemBackgroundsQueryDto,
  ): Promise<ResponseBackgroundListDto> {
    this.assetsService.assertAuthenticated(context);

    const { db, repository } = this.backgroundsService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toResponse(page, isSysAdminRole(context.systemRole), query.limit);
  }

  private async listInCampaign(
    context: RequestContext,
    campaignId: string,
    query: RequestCampaignBackgroundsQueryDto | RequestBackgroundCatalogQueryDto,
    purpose: ContentReadPurpose,
  ): Promise<ResponseBackgroundListDto> {
    const access = await this.assetsService.access(context, campaignId);
    const { db, repository } = this.backgroundsService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: access.listWhere(purpose, {
        scope: "scope" in query ? query.scope : undefined,
        status: query.status,
      }),
    });

    return this.toResponse(page, access.isFullView, query.limit);
  }

  private baseFilter(query: RequestCampaignBackgroundsQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      customizationMode: query.customizationMode,
      abilityMode: query.abilityMode,
      ability: query.ability,
      search: query.search,
    };
  }

  private async toResponse(
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

/** Custom backgrounds of a campaign. */
export class ListCampaignBackgroundsUseCase {
  constructor(private readonly listing: BackgroundListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignBackgroundsQueryDto },
  ) {
    return this.listing.listCampaign(context, input);
  }
}

/** What a campaign may use: active global backgrounds for its ruleset and its own backgrounds. */
export class ListBackgroundCatalogUseCase {
  constructor(private readonly listing: BackgroundListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; query: RequestBackgroundCatalogQueryDto },
  ) {
    return this.listing.listCatalog(context, input);
  }
}

/** Global backgrounds; drafts and archived ones for administrators only. */
export class ListSystemBackgroundsUseCase {
  constructor(private readonly listing: BackgroundListing) {}

  execute(context: RequestContext, input: { query: RequestSystemBackgroundsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
