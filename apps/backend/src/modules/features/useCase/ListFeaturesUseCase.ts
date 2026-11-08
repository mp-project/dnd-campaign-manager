import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { ContentReadPurpose } from "#core/content/access";
import type { AssetsService } from "#src/modules/assets/index";
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
import type { FeaturePage } from "#src/modules/features/domain/repository/FeaturesRepository";
import { FeaturesService } from "#src/modules/features/service/FeaturesService";

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
    return this.listInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: RequestFeatureCatalogQueryDto },
  ): Promise<ResponseFeatureListDto> {
    return this.listInCampaign(context, input.campaignId, input.query, "CATALOG");
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
      where: this.assetsService.globalListWhere(context, query),
    });

    return this.toResponse(page, isAdmin, query.limit);
  }

  /** The campaign's own features (`MANAGE`) or what the campaign may use (`CATALOG`). */
  private async listInCampaign(
    context: RequestContext,
    campaignId: string,
    query: RequestCampaignFeaturesQueryDto | RequestFeatureCatalogQueryDto,
    purpose: ContentReadPurpose,
  ): Promise<ResponseFeatureListDto> {
    const access = await this.assetsService.access(context, campaignId);
    const { db, repository } = this.featuresService;
    const page = await repository.listPage(db, {
      ...this.baseFilter(query),
      where: access.listWhere(purpose, {
        scope: "scope" in query ? query.scope : undefined,
        status: query.status,
      }),
    });

    return this.toResponse(page, access.isFullView, query.limit);
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

    return toFeatureListResponse({ page, data: records.map(toFeatureListItemFullResponse), limit });
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
