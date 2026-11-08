import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { ContentReadPurpose } from "#core/content/access";
import type { AssetsService } from "#src/modules/assets/index";
import type {
  RequestCampaignClassesQueryDto,
  RequestClassCatalogQueryDto,
  RequestSystemClassesQueryDto,
} from "#src/modules/classes/domain/dto/RequestClassDto";
import {
  type ResponseClassListDto,
  toClassListItemFullResponse,
  toClassListItemPlayerResponse,
  toClassListResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import type { ClassPage } from "#src/modules/classes/domain/repository/ClassesRepository";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class ClassListing {
  constructor(
    private readonly classesService: ClassesService,
    private readonly assetsService: AssetsService,
  ) {}

  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignClassesQueryDto },
  ): Promise<ResponseClassListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  /**
   * What the campaign may use: active global classes for its ruleset and its own classes (for
   * players only released ones), plus archived classes the campaign still uses. Those are marked
   * `selectable: false`; they cannot be chosen anew.
   */
  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestClassCatalogQueryDto },
  ): Promise<ResponseClassListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "CATALOG");
  }

  async listSystem(
    context: RequestContext,
    query: RequestSystemClassesQueryDto,
  ): Promise<ResponseClassListDto> {
    this.assetsService.assertAuthenticated(context);

    const isAdmin = isSysAdminRole(context.systemRole);
    const { db, repository } = this.classesService;
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
    query: RequestCampaignClassesQueryDto | RequestClassCatalogQueryDto,
    purpose: ContentReadPurpose,
  ): Promise<ResponseClassListDto> {
    const access = await this.assetsService.access(context, campaignId);
    const { db, repository } = this.classesService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: access.listWhere(purpose, {
        scope: "scope" in query ? query.scope : undefined,
        status: query.status,
      }),
    });

    return this.toResponse(page, access.isFullView, query.limit);
  }

  private baseFilter(query: RequestCampaignClassesQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      hitDie: query.hitDie,
      spellcastingType: query.spellcastingType,
      search: query.search,
    };
  }

  private async toResponse(
    page: ClassPage,
    fullView: boolean,
    limit: number,
  ): Promise<ResponseClassListDto> {
    if (!fullView) {
      return toClassListResponse({
        page,
        data: page.items.map(toClassListItemPlayerResponse),
        limit,
      });
    }

    const records = await this.classesService.loadRecords(this.classesService.db, page.items);

    return toClassListResponse({ page, data: records.map(toClassListItemFullResponse), limit });
  }
}

/** Custom classes of a campaign. */
export class ListCampaignClassesUseCase {
  constructor(private readonly listing: ClassListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignClassesQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}

/** What a campaign may use: active global classes for its ruleset and its own classes. */
export class ListClassCatalogUseCase {
  constructor(private readonly listing: ClassListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestClassCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}

/** Global classes; drafts and archived ones for administrators only. */
export class ListSystemClassesUseCase {
  constructor(private readonly listing: ClassListing) {}

  execute(context: RequestContext, input: { query: RequestSystemClassesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
