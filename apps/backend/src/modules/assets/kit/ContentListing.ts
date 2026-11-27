import type { SQL } from "drizzle-orm";

import type { ContentReadPurpose } from "#core/content/access";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import type { AssetRow } from "#src/modules/assets/domain/repository/AssetsRepository";
import type { AssetStatus } from "#src/modules/assets/domain/dto/BaseAssetDto";
import type { AssetsService } from "#src/modules/assets/service/AssetsService";

/** What every list query of content carries besides the module's own filters. */
export type ContentListQuery = {
  limit: number;
  status?: AssetStatus | undefined;
};

/** The catalog may also be narrowed to global or campaign content. */
export type ContentCatalogQuery = ContentListQuery & { scope?: AssetRow["scope"] | undefined };

/** Global lists may name a ruleset. */
export type ContentSystemQuery = ContentListQuery & { rulesetId?: string | undefined };

/** The types of one kind of content's lists, as one parameter for `ContentListing`. */
export type ContentListTypes = {
  campaignQuery: ContentListQuery;
  catalogQuery: ContentCatalogQuery;
  systemQuery: ContentSystemQuery;
  /** The module's own filters, built from a query by `filterOf`. */
  filter: object;
  page: unknown;
  response: unknown;
};

/**
 * The three lists of content on assets: the campaign's own content (`MANAGE`, its management
 * routes), what the campaign may use (`CATALOG`: global content for its ruleset and its own, for
 * players only what they may see, plus archived content still in use) and global content (drafts
 * and archived content for administrators only). Who sees what comes from the access session and
 * `globalListWhere`; the module adds its filters, the query and the mapping. Lists carry no
 * definitions; those come with the detail view.
 */
export abstract class ContentListing<T extends ContentListTypes> {
  constructor(protected readonly assets: AssetsService) {}

  /** The module's own filters of a query (search, category, level …) and the paging. */
  protected abstract filterOf(query: T["campaignQuery"] | T["catalogQuery"] | T["systemQuery"]): T["filter"];

  /** One page of content matching the filters and `where` (who may see what). */
  protected abstract listPage(filter: T["filter"] & { where: SQL }): Promise<T["page"]>;

  /** The page as the answer: full items for the full view, player items otherwise. */
  protected abstract toResponse(page: T["page"], fullView: boolean, limit: number): Promise<T["response"]>;

  async listCampaign(
    context: RequestContext,
    input: { campaignId: string; query: T["campaignQuery"] },
  ): Promise<T["response"]> {
    return this.listInCampaign(context, input.campaignId, input.query, "MANAGE");
  }

  async listCatalog(
    context: RequestContext,
    input: { campaignId: string; query: T["catalogQuery"] },
  ): Promise<T["response"]> {
    return this.listInCampaign(context, input.campaignId, input.query, "CATALOG");
  }

  async listSystem(context: RequestContext, query: T["systemQuery"]): Promise<T["response"]> {
    this.assets.assertAuthenticated(context);

    const page = await this.listPage({
      ...this.filterOf(query),
      where: this.assets.globalListWhere(context, query),
    });

    return this.toResponse(page, isSysAdminRole(context.systemRole), query.limit);
  }

  private async listInCampaign(
    context: RequestContext,
    campaignId: string,
    query: T["campaignQuery"] | T["catalogQuery"],
    purpose: ContentReadPurpose,
  ): Promise<T["response"]> {
    const access = await this.assets.access(context, campaignId);
    const page = await this.listPage({
      ...this.filterOf(query),
      where: access.listWhere(purpose, {
        scope: "scope" in query ? query.scope : undefined,
        status: query.status,
      }),
    });

    return this.toResponse(page, access.isFullView, query.limit);
  }
}
