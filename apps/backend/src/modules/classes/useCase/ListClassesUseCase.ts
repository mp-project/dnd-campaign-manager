import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, AssetStatus } from "#src/modules/assets/index";
import type {
  RequestCampaignClassesQueryDto,
  RequestClassCatalogQueryDto,
  RequestSystemClassesQueryDto,
} from "#src/modules/classes/domain/dto/RequestClassDto";
import {
  type ResponseClassListDto,
  toClassListItemGmResponse,
  toClassListItemPlayerResponse,
  toClassListResponse,
} from "#src/modules/classes/domain/dto/ResponseClassDto";
import type {
  ClassListFilter,
  ClassPage,
} from "#src/modules/classes/domain/repository/ClassesRepository";
import { ClassesService } from "#src/modules/classes/service/ClassesService";

const EDITOR_DEFAULT_STATUSES: readonly AssetStatus[] = ["DRAFT", "ACTIVE"];

/** Statuses an editor asked for, or the default; players and readers only get active entries. */
function statusesFor(canEdit: boolean, status: AssetStatus | undefined): readonly AssetStatus[] {
  if (!canEdit) {
    return status === undefined || status === "ACTIVE" ? ["ACTIVE"] : [];
  }

  return status ? [status] : EDITOR_DEFAULT_STATUSES;
}

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
    return this.listInCampaign(context, input.campaignId, input.query, { system: false });
  }

  /**
   * What the campaign may choose from: active global classes for its ruleset and its own classes
   * (for players only released ones). Archived classes are not offered anymore.
   */
  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestClassCatalogQueryDto },
  ): Promise<ResponseClassListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, {
      system: input.query.scope !== "CAMPAIGN",
      campaign: input.query.scope !== "SYSTEM",
    });
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
    query: RequestCampaignClassesQueryDto,
    include: { system: boolean; campaign?: boolean },
  ): Promise<ResponseClassListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, campaignId);
    const { db, repository } = this.classesService;
    const isGm = viewer.view === "GM";
    const filter: ClassListFilter = {
      ...this.baseFilter(query),
      system: include.system
        ? {
            // Global drafts and archived classes are not offered to campaigns.
            statuses: query.status === undefined || query.status === "ACTIVE" ? ["ACTIVE"] : [],
            rulesetCondition: this.assetsService.repository.compatibleWith(db, viewer.rulesetId),
          }
        : undefined,
      campaign:
        include.campaign === false
          ? undefined
          : {
              campaignId: viewer.campaignId,
              statuses: statusesFor(isGm, query.status),
              assetIds: isGm ? undefined : await this.assetsService.listVisibleAssetIds(viewer),
            },
    };

    return this.toResponse(await repository.listPage(db, filter), isGm, query.limit);
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

    return toClassListResponse({ page, data: records.map(toClassListItemGmResponse), limit });
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
