import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, AssetStatus } from "#src/modules/assets/index";
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

const EDITOR_DEFAULT_STATUSES: readonly AssetStatus[] = ["DRAFT", "ACTIVE"];

/** Statuses an editor asked for, or the default; players and readers only get active entries. */
function statusesFor(canEdit: boolean, status: AssetStatus | undefined): readonly AssetStatus[] {
  if (!canEdit) {
    return status === undefined || status === "ACTIVE" ? ["ACTIVE"] : [];
  }

  return status ? [status] : EDITOR_DEFAULT_STATUSES;
}

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
    return this.listInCampaign(context, input.campaignId, input.query, {
      system: false,
      catalog: false,
    });
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
    return this.listInCampaign(context, input.campaignId, input.query, {
      system: input.query.scope !== "CAMPAIGN",
      campaign: input.query.scope !== "SYSTEM",
      catalog: true,
    });
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
      system: {
        statuses: statusesFor(isAdmin, query.status),
        rulesetCondition: query.rulesetId
          ? this.assetsService.repository.compatibleWith(db, query.rulesetId)
          : undefined,
      },
    });

    return this.toResponse(page, isAdmin, query.limit);
  }

  private async listInCampaign(
    context: RequestContext,
    campaignId: string,
    query: RequestCampaignSpeciesQueryDto,
    include: { system: boolean; campaign?: boolean; catalog: boolean },
  ): Promise<ResponseSpeciesListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, campaignId);
    const { db, repository } = this.speciesService;
    const isFullView = viewer.view === "FULL";
    // GMs manage their own archived species in the campaign list; everywhere else archived species
    // only stay while the campaign still uses them.
    const managesArchived = isFullView && !include.catalog;
    const inUse =
      !managesArchived && (query.status === undefined || query.status === "ARCHIVED")
        ? [...(await this.assetsService.listInUseAssetIds(viewer.campaignId))]
        : undefined;
    const filter: SpeciesListFilter = {
      ...this.baseFilter(query),
      system: include.system
        ? {
            // Global drafts are not offered to campaigns.
            statuses: query.status === undefined || query.status === "ACTIVE" ? ["ACTIVE"] : [],
            archivedAssetIds: inUse,
            rulesetCondition: this.assetsService.repository.compatibleWith(db, viewer.rulesetId),
          }
        : undefined,
      campaign:
        include.campaign === false
          ? undefined
          : {
              campaignId: viewer.campaignId,
              statuses: statusesFor(isFullView, query.status).filter(
                (status) => managesArchived || status !== "ARCHIVED",
              ),
              assetIds: isFullView ? undefined : await this.assetsService.listVisibleAssetIds(viewer),
              archivedAssetIds: inUse,
            },
    };

    return this.toResponse(await repository.listPage(db, filter), isFullView, query.limit);
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
