import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetsService, AssetStatus } from "#src/modules/assets/index";
import type {
  RequestCampaignFeaturesQueryDto,
  RequestFeatureCatalogQueryDto,
  RequestSystemFeaturesQueryDto,
} from "#src/modules/features/domain/dto/RequestFeatureDto";
import {
  type ResponseFeatureListDto,
  toFeatureListItemGmResponse,
  toFeatureListItemPlayerResponse,
  toFeatureListResponse,
} from "#src/modules/features/domain/dto/ResponseFeatureDto";
import type {
  FeatureListFilter,
  FeaturePage,
} from "#src/modules/features/domain/repository/FeaturesRepository";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

const EDITOR_DEFAULT_STATUSES: readonly AssetStatus[] = ["DRAFT", "ACTIVE"];

/** Statuses an editor asked for, or the default; players and readers only get active entries. */
function statusesFor(canEdit: boolean, status: AssetStatus | undefined): readonly AssetStatus[] {
  if (!canEdit) {
    return status === undefined || status === "ACTIVE" ? ["ACTIVE"] : [];
  }

  return status ? [status] : EDITOR_DEFAULT_STATUSES;
}

/**
 * Shared by the list use cases. Lists carry no definitions; those come with the detail view.
 */
export class FeatureListing {
  constructor(
    private readonly featuresService: FeaturesService,
    private readonly assetsService: AssetsService,
  ) {}

  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: RequestCampaignFeaturesQueryDto },
  ): Promise<ResponseFeatureListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, { system: false });
  }

  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestFeatureCatalogQueryDto },
  ): Promise<ResponseFeatureListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, {
      system: input.query.scope !== "CAMPAIGN",
      campaign: input.query.scope !== "SYSTEM",
    });
  }

  async listSystem(
    context: RequestContext,
    query: RequestSystemFeaturesQueryDto,
  ): Promise<ResponseFeatureListDto> {
    this.assetsService.assertAuthenticated(context);

    const isAdmin = isSysAdminRole(context.systemRole);
    const { db, repository } = this.featuresService;
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
    query: RequestCampaignFeaturesQueryDto,
    include: { system: boolean; campaign?: boolean },
  ): Promise<ResponseFeatureListDto> {
    const viewer = await this.assetsService.resolveCampaignViewer(context, campaignId);
    const { db, repository } = this.featuresService;
    const isGm = viewer.view === "GM";
    const filter: FeatureListFilter = {
      ...this.baseFilter(query),
      system: include.system
        ? {
            // Global drafts and archived features are not offered to campaigns.
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

  private baseFilter(query: RequestCampaignFeaturesQueryDto) {
    return {
      limit: query.limit,
      cursor: query.cursor,
      featureType: query.featureType,
      search: query.search,
    };
  }

  private async toResponse(
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

    return toFeatureListResponse({ page, data: records.map(toFeatureListItemGmResponse), limit });
  }
}

/** Custom features of a campaign. */
export class ListCampaignFeaturesUseCase {
  constructor(private readonly listing: FeatureListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestCampaignFeaturesQueryDto }) {
    return this.listing.listCampaign(context, input);
  }
}

/** What a campaign may use: active global features for its ruleset and its own features. */
export class ListFeatureCatalogUseCase {
  constructor(private readonly listing: FeatureListing) {}

  execute(context: RequestContext, input: { campaignId: string; query: RequestFeatureCatalogQueryDto }) {
    return this.listing.listCatalog(context, input);
  }
}

/** Global features; drafts and archived ones for administrators only. */
export class ListSystemFeaturesUseCase {
  constructor(private readonly listing: FeatureListing) {}

  execute(context: RequestContext, input: { query: RequestSystemFeaturesQueryDto }) {
    return this.listing.listSystem(context, input.query);
  }
}
