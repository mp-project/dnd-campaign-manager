import type { ContentReadPurpose } from "#core/content/access";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, ContentAccess } from "#src/modules/assets/index";
import type {
  RequestCampaignSpellListsQueryDto,
  RequestCampaignSpellsQueryDto,
  RequestSpellCatalogQueryDto,
  RequestSpellListCatalogQueryDto,
  RequestSystemSpellListsQueryDto,
  RequestSystemSpellsQueryDto,
} from "#src/modules/spells/domain/dto/RequestSpellDto";
import {
  type ResponseSpellListDto,
  type ResponseSpellListListDto,
  toSpellListItemFullResponse,
  toSpellListItemPlayerResponse,
  toSpellListListItemFullResponse,
  toSpellListListItemPlayerResponse,
  toSpellListPageResponse,
  toSpellPageResponse,
} from "#src/modules/spells/domain/dto/ResponseSpellDto";
import type {
  SpellListMembership,
  SpellListPage,
  SpellPage,
} from "#src/modules/spells/domain/repository/SpellsRepository";
import type { SpellsService } from "#src/modules/spells/service/SpellsService";

/**
 * The spell list a class refers to (`spellcasting.spellListAssetId`), after checking that the
 * viewer may read the class in the catalog of the campaign; null for classes without one. Provided
 * by the classes module.
 */
export type ClassSpellListPort = (
  access: ContentAccess,
  classId: string,
) => Promise<string | null>;

type SpellsQuery = RequestCampaignSpellsQueryDto & Partial<Pick<RequestSpellCatalogQueryDto, "list" | "class">>;

/** Shared by the list use cases. Lists carry no definitions; those come with the detail view. */
export class SpellListing {
  constructor(
    private readonly spellsService: SpellsService,
    private readonly assetsService: AssetsService,
    private readonly classSpellList: ClassSpellListPort,
  ) {}

  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignSpellsQueryDto },
  ): Promise<ResponseSpellListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  /**
   * What the campaign may use: active global spells for its ruleset and its own spells (for players
   * only released ones or those of released lists), plus archived spells the campaign still uses,
   * marked `selectable: false`. `list` and `class` keep the spells of that list in the campaign.
   */
  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestSpellCatalogQueryDto },
  ): Promise<ResponseSpellListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "CATALOG");
  }

  async listSystem(context: RequestContext, query: RequestSystemSpellsQueryDto): Promise<ResponseSpellListDto> {
    this.assetsService.assertAuthenticated(context);

    const { db, repository } = this.spellsService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toResponse(page, isSysAdminRole(context.systemRole), query.limit);
  }

  async listCampaignLists(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignSpellListsQueryDto },
  ): Promise<ResponseSpellListListDto> {
    return this.listListsInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  async listListCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestSpellListCatalogQueryDto },
  ): Promise<ResponseSpellListListDto> {
    return this.listListsInCampaign(context, input.campaignId, input.query, "CATALOG");
  }

  async listSystemLists(
    context: RequestContext,
    query: RequestSystemSpellListsQueryDto,
  ): Promise<ResponseSpellListListDto> {
    this.assetsService.assertAuthenticated(context);

    const { db, listRepository } = this.spellsService;
    const page = await listRepository.listPage(db, {
      limit: query.limit,
      cursor: query.cursor,
      search: query.search,
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toListResponse(page, isSysAdminRole(context.systemRole), query.limit);
  }

  private async listInCampaign(
    context: RequestContext,
    campaignId: string,
    query: SpellsQuery & { scope?: RequestSpellCatalogQueryDto["scope"] },
    purpose: ContentReadPurpose,
  ): Promise<ResponseSpellListDto> {
    const access = await this.assetsService.access(context, campaignId);
    const memberOf = await this.membershipsOf(access, query);
    const { db, repository } = this.spellsService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      memberOf,
      where: access.listWhere(purpose, { scope: query.scope, status: query.status }),
    });

    return this.toResponse(page, access.isFullView, query.limit);
  }

  /** The lists the query asks for; a list or class the viewer can't read is 404. */
  private async membershipsOf(
    access: ContentAccess,
    query: SpellsQuery,
  ): Promise<(SpellListMembership | null)[]> {
    const memberships: (SpellListMembership | null)[] = [];

    if (query.list) {
      const found = await this.spellsService.requireReadableSpellList(access, query.list, "CATALOG");

      memberships.push(this.spellsService.membershipOf(found));
    }

    if (query.class) {
      // A class without a list, or with one the viewer may not read, has no spells to show.
      const listAssetId = await this.classSpellList(access, query.class);
      const list =
        listAssetId === null ? null : await this.spellsService.findReadableListByAsset(access, listAssetId);

      memberships.push(list === null ? null : this.spellsService.membershipOf(list));
    }

    return memberships;
  }

  private async listListsInCampaign(
    context: RequestContext,
    campaignId: string,
    query: RequestCampaignSpellListsQueryDto & { scope?: RequestSpellListCatalogQueryDto["scope"] },
    purpose: ContentReadPurpose,
  ): Promise<ResponseSpellListListDto> {
    const access = await this.assetsService.access(context, campaignId);
    const { db, listRepository } = this.spellsService;
    const page = await listRepository.listPage(db, {
      limit: query.limit,
      cursor: query.cursor,
      search: query.search,
      where: access.listWhere(purpose, { scope: query.scope, status: query.status }),
    });

    return this.toListResponse(page, access.isFullView, query.limit);
  }

  private baseFilter(query: RequestCampaignSpellsQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      level: query.level,
      maxLevel: query.maxLevel,
      school: query.school,
      ritual: query.ritual,
      concentration: query.concentration,
      component: query.component,
      effect: query.effect,
      search: query.search,
    };
  }

  private async toResponse(page: SpellPage, fullView: boolean, limit: number): Promise<ResponseSpellListDto> {
    if (!fullView) {
      return toSpellPageResponse({ page, data: page.items.map(toSpellListItemPlayerResponse), limit });
    }

    const records = await this.spellsService.loadRecords(this.spellsService.db, page.items);

    return toSpellPageResponse({ page, data: records.map(toSpellListItemFullResponse), limit });
  }

  private async toListResponse(
    page: SpellListPage,
    fullView: boolean,
    limit: number,
  ): Promise<ResponseSpellListListDto> {
    if (!fullView) {
      return toSpellListPageResponse({ page, data: page.items.map(toSpellListListItemPlayerResponse), limit });
    }

    const records = await this.spellsService.loadListRecords(this.spellsService.db, page.items);

    return toSpellListPageResponse({ page, data: records.map(toSpellListListItemFullResponse), limit });
  }
}

type CampaignInput<Q> = { campaignId: string; query: Q };

/** Custom spells of a campaign. */
export class ListCampaignSpellsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: CampaignInput<RequestCampaignSpellsQueryDto>) {
    return this.listing.listCampaign(context, input);
  }
}

/** What a campaign may use: active global spells for its ruleset and its own spells. */
export class ListSpellCatalogUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: CampaignInput<RequestSpellCatalogQueryDto>) {
    return this.listing.listCatalog(context, input);
  }
}

/** Global spells; drafts and archived ones for administrators only. */
export class ListSystemSpellsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSpellsQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}

/**
 * The spells of one list in the catalog of the campaign: its own entries and the spells that name
 * it, with the filters of the spell catalog.
 */
export class ListSpellListSpellsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(
    context: RequestContext,
    input: { campaignId: string; spellListId: string; query: RequestSpellCatalogQueryDto },
  ) {
    return this.listing.listCatalog(context, {
      campaignId: input.campaignId,
      query: { ...input.query, list: input.spellListId },
    });
  }
}

export class ListCampaignSpellListsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: CampaignInput<RequestCampaignSpellListsQueryDto>) {
    return this.listing.listCampaignLists(context, input);
  }
}

export class ListSpellListCatalogUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: CampaignInput<RequestSpellListCatalogQueryDto>) {
    return this.listing.listListCatalog(context, input);
  }
}

export class ListSystemSpellListsUseCase {
  constructor(private readonly listing: SpellListing) {}

  execute(context: RequestContext, input: { query: RequestSystemSpellListsQueryDto }) {
    return this.listing.listSystemLists(context, input.query);
  }
}
