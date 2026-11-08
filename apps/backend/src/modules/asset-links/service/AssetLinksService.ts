import type { FastifyBaseLogger } from "fastify";

import { campaignRoleOf, type ContentViewer } from "#core/content/viewer";
import { decideContentWrite } from "#core/content/writeAccess";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { ActionScope, ChangeResult } from "#core/history/types";
import type { CreateAssetLinkDto } from "#src/modules/asset-links/domain/dto/CreateAssetLinkDto";
import type { UpdateAssetLinkDto } from "#src/modules/asset-links/domain/dto/UpdateAssetLinkDto";
import {
  type AssetUsageItemDto,
  type ResponseAssetUsagesDto,
  toAssetLinkDirection,
} from "#src/modules/asset-links/domain/dto/ResponseAssetLinkDto";
import type {
  AssetLinkRow,
  AssetLinksRepository,
} from "#src/modules/asset-links/domain/repository/AssetLinksRepository";
import {
  createTrackedAssetLink,
  type TrackedAssetLink,
} from "#src/modules/asset-links/history/TrackedAssetLink";
import type { AssetRelationRegistry } from "#src/modules/asset-links/service/AssetRelationRegistry";
import type {
  AssetRow,
  AssetsService,
  AssetType,
  ContentAccess,
} from "#src/modules/assets/index";

/** Campaign facts the module needs; provided by the campaigns module. */
export type AssetLinkCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{
    campaignId: string;
    rulesetId: string;
    role: "EDITOR" | "PLAYER" | null;
    isOwner: boolean;
  } | null>;
};

export const ASSET_USAGE_GROUPS = ["outlinePlacements", "shares", "typedUsages"] as const;

export type AssetUsageGroup = (typeof ASSET_USAGE_GROUPS)[number];

/** Reports where other modules use an asset, such as outline entries or shares. */
export type AssetUsageProvider = {
  name: string;
  group: AssetUsageGroup;
  /** Every usage in the campaign. Players only get items whose `assetId` they may see. */
  listUsages(
    input: { assetId: string; campaignId: string },
    db: AppDatabase,
  ): Promise<AssetUsageItemDto[]>;
  /**
   * Replaces `listUsages` for players, for usages that reveal more than the asset itself, like
   * who else something was shared with.
   */
  listUsagesForPlayer?(
    input: { assetId: string; campaignId: string; actorId: string },
    db: AppDatabase,
  ): Promise<AssetUsageItemDto[]>;
  /**
   * Usages that forbid archiving. Runs in the transaction of the archiving, so it may only use
   * `db`. `campaignId` is null for global assets, which can be used in every campaign.
   */
  listBlockingUsages?(
    input: { assetId: string; campaignId: string | null },
    db: AppDatabase,
  ): Promise<AssetUsageItemDto[]>;
};

/**
 * Builds the routes of the module that edits assets of a type, for all assets of one request at
 * once, so the module can look up its own ids in one query. Assets without a route are left out.
 */
export type AssetEditRouteBuilder = (
  input: { campaignId: string; assetIds: readonly string[] },
  db: AppDatabase,
) => ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>;

/** A link end that may get an edit route. */
type EditTarget = { campaignId: string; assetId: string; asset: AssetRow | undefined };

type LinkPath = { campaignId: string; sourceAssetId: string; linkId: string };

/**
 * Relations between assets and the view on where an asset is used.
 *
 * Methods taking an action scope are meant to be called by use cases inside their own action, also
 * those of domain modules; they do not check rights, which remain the caller's responsibility.
 */
export class AssetLinksService {
  private readonly usageProviders: AssetUsageProvider[] = [];
  private readonly editRoutes = new Map<AssetType, AssetEditRouteBuilder>();
  public readonly trackedLink: TrackedAssetLink;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: AssetLinksRepository,
    public readonly relations: AssetRelationRegistry,
    private readonly assets: AssetsService,
    private readonly campaignAccess: AssetLinkCampaignAccessPort,
    private readonly logger: Pick<FastifyBaseLogger, "error">,
  ) {
    this.trackedLink = createTrackedAssetLink({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      parseMetadata: (relationType, metadata) =>
        relations.parseMetadata(relationType, metadata),
      assertSourceChangeable: async (sourceAssetId, tx) => {
        const source = await assets.requireAsset(tx, sourceAssetId);

        if (source.status === "ARCHIVED") {
          throw new ConflictError("Links of archived assets cannot be modified", {
            assetId: source.id,
          });
        }
      },
    });
  }

  registerUsageProvider(provider: AssetUsageProvider): void {
    if (this.usageProviders.some((existing) => existing.name === provider.name)) {
      throw new Error(`Asset usage provider '${provider.name}' is already registered`);
    }

    this.usageProviders.push(provider);
  }

  registerEditRoute(assetType: AssetType, build: AssetEditRouteBuilder): void {
    if (this.editRoutes.has(assetType)) {
      throw new Error(`Edit route for asset type '${assetType}' is already registered`);
    }

    this.editRoutes.set(assetType, build);
  }

  // ---------------------------------------------------------------------------
  // Port for domain modules
  // ---------------------------------------------------------------------------

  async createLink(
    scope: ActionScope,
    params: { actorId: string; campaignId: string; sourceAssetId: string },
    input: CreateAssetLinkDto,
  ): Promise<{ link: AssetLinkRow; target: AssetRow }> {
    const db = scope.tx;
    const relation = this.relations.require(input.relationType);
    const metadata = this.relations.parseMetadata(input.relationType, input.metadata ?? {});
    const campaign = await this.campaignAccess.findCampaignRole(
      params.campaignId,
      params.actorId,
      db,
    );

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    // Archiving takes a stronger lock on the row, so it either sees this link or the link sees the
    // archived asset.
    await this.assets.lockForUse([params.sourceAssetId, input.targetAssetId], db);

    const source = await this.assets.requireAsset(db, params.sourceAssetId);

    this.assets.assertSameCampaign(source, params.campaignId);

    if (source.scope !== "CAMPAIGN") {
      throw new ConflictError("Links can only start at assets of a campaign", {
        assetId: source.id,
      });
    }

    if (source.status === "ARCHIVED") {
      throw new ConflictError("Links of archived assets cannot be modified", {
        assetId: source.id,
      });
    }

    const { asset: target } = await this.assets.assertAvailable(
      { assetId: input.targetAssetId, campaignId: params.campaignId, rulesetId: campaign.rulesetId },
      db,
    );

    this.relations.assertEndpoints(input.relationType, source, target);

    const link = await this.withConstraintErrors(() =>
      scope.create(this.trackedLink, {
        campaignId: params.campaignId,
        sourceAssetId: source.id,
        targetAssetId: target.id,
        relationType: input.relationType,
        label: input.label ?? null,
        sortOrder: input.sortOrder ?? 0,
        metadata,
        allowMultiple: relation.allowMultiple ?? false,
      }),
    );

    return { link, target };
  }

  /**
   * Fields the client sent unchanged while somebody else changed them keep the newer value; they
   * are listed in `merged`.
   */
  async updateLink(
    scope: ActionScope,
    params: LinkPath & { command: UpdateAssetLinkDto },
  ): Promise<ChangeResult<AssetLinkRow>> {
    const { expectedVersion, ...patch } = params.command;

    return scope.change(this.trackedLink, params.linkId, (current) => {
      this.assertLinkOfPath(current, params);

      const set: Record<string, unknown> = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      );

      if (patch.metadata !== undefined) {
        set.metadata = this.relations.parseMetadata(current.relationType, patch.metadata);
      }

      return { set, baseVersion: expectedVersion };
    });
  }

  /** Works for archived sources too, because that is how a blocking link gets resolved. */
  async removeLink(scope: ActionScope, params: LinkPath): Promise<void> {
    const link = await this.repository.findById(scope.tx, params.linkId);

    if (!link) {
      throw new NotFoundError("Asset link not found");
    }

    this.assertLinkOfPath(link, params);

    await scope.softDelete(this.trackedLink, link.id);
  }

  /**
   * Rejects archiving with 409 and the list of what stands in the way. Providers run one after the
   * other because they share the transaction, and a failing provider rejects the archiving.
   */
  async assertNoBlockingUsages(asset: AssetRow, db: AppDatabase): Promise<void> {
    const links = await this.repository.listIncomingOfTypes(
      db,
      asset.id,
      this.relations.listBlockingTypes(),
    );
    const sources = await this.assets.findMany(
      links.map((link) => link.sourceAssetId),
      db,
    );
    const editRoutes = await this.resolveEditRoutes(
      links.map((link) => ({
        campaignId: link.campaignId,
        assetId: link.sourceAssetId,
        asset: sources.get(link.sourceAssetId),
      })),
      db,
    );
    const blocking: AssetUsageItemDto[] = links.map((link) =>
      this.toLinkUsageItem(link, sources.get(link.sourceAssetId), link.sourceAssetId, {
        editRoute: editRoutes.get(editRouteKey(link.campaignId, link.sourceAssetId)) ?? null,
      }),
    );

    for (const provider of this.usageProviders) {
      blocking.push(
        ...((await provider.listBlockingUsages?.(
          { assetId: asset.id, campaignId: asset.campaignId },
          db,
        )) ?? []),
      );
    }

    if (blocking.length > 0) {
      throw new ConflictError("The asset is still in use", {
        assetId: asset.id,
        blockingUsages: blocking,
      });
    }
  }

  /**
   * The links of the asset the viewer may see, with their other ends: the other end must be
   * readable (`READ`), and players only see relations marked as visible to them. Links and usages
   * use this one rule.
   */
  async readableLinks(
    access: ContentAccess,
    links: readonly AssetLinkRow[],
    assetId: string,
  ): Promise<{ link: AssetLinkRow; other: AssetRow }[]> {
    const related = await this.assets.findMany(links.map((link) => otherEndOf(link, assetId)), this.db);
    const readable = await access.readableIds("READ", [...related.values()]);

    return links.flatMap((link) => {
      const other = related.get(otherEndOf(link, assetId));
      const visibleRelation =
        access.isFullView || (this.relations.find(link.relationType)?.playerVisible ?? false);

      return other && readable.has(other.id) && visibleRelation ? [{ link, other }] : [];
    });
  }

  async getUsages(access: ContentAccess, assetId: string): Promise<ResponseAssetUsagesDto> {
    const { viewer } = access;
    const [links, provided] = await Promise.all([
      this.repository.listForAsset(this.db, { campaignId: viewer.campaignId, assetId }),
      this.collectProvidedUsages(viewer, assetId),
    ]);
    const [visibleLinks, providedAssets] = await Promise.all([
      this.readableLinks(access, links, assetId),
      this.assets.findMany(
        provided.items.flatMap(({ item }) => (item.assetId ? [item.assetId] : [])),
        this.db,
      ),
    ]);
    const readable = await access.readableIds("READ", [...providedAssets.values()]);
    const usages: ResponseAssetUsagesDto = {
      assetId,
      view: viewer.view,
      incoming: [],
      outgoing: [],
      outlinePlacements: [],
      shares: [],
      typedUsages: [],
      unavailableProviders: provided.failed,
    };
    const mayEdit = (asset: AssetRow | undefined): boolean =>
      asset !== undefined && decideContentWrite(viewer, "EDIT", asset) === "ALLOWED";
    const editRoutes = await this.resolveEditRoutes(
      visibleLinks.flatMap(({ other }) =>
        mayEdit(other) ? [{ campaignId: viewer.campaignId, assetId: other.id, asset: other }] : [],
      ),
      this.db,
    );

    for (const { link, other } of visibleLinks) {
      usages[toAssetLinkDirection(link, assetId)].push(
        this.toLinkUsageItem(link, other, other.id, {
          editRoute: editRoutes.get(editRouteKey(viewer.campaignId, other.id)) ?? null,
        }),
      );
    }

    for (const { group, item } of provided.items) {
      const related = item.assetId ? providedAssets.get(item.assetId) : undefined;

      // Items without an asset only go to the full view.
      if (related ? !readable.has(related.id) : !access.isFullView) {
        continue;
      }

      // An item about the asset itself (a share) edits something of the campaign, not the asset.
      const keepsRoute = access.isFullView && (item.assetId === assetId || mayEdit(related));

      usages[group].push(keepsRoute ? item : { ...item, editRoute: null });
    }

    return usages;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** One failing provider leaves its group incomplete; the answer says which one it was. */
  private async collectProvidedUsages(viewer: ContentViewer, assetId: string) {
    const { campaignId, actorId } = viewer;
    const results = await Promise.allSettled(
      this.usageProviders.map((provider) =>
        viewer.view === "PLAYER" && provider.listUsagesForPlayer
          ? provider.listUsagesForPlayer({ assetId, campaignId, actorId }, this.db)
          : provider.listUsages({ assetId, campaignId }, this.db),
      ),
    );
    const items: { group: AssetUsageProvider["group"]; item: AssetUsageItemDto }[] = [];
    const failed: string[] = [];

    results.forEach((result, index) => {
      const provider = this.usageProviders[index] as AssetUsageProvider;

      if (result.status === "fulfilled") {
        items.push(...result.value.map((item) => ({ group: provider.group, item })));
      } else {
        this.logger.error(
          { error: result.reason, provider: provider.name },
          "Asset usage provider failed",
        );
        failed.push(provider.name);
      }
    });

    return { items, failed };
  }

  /**
   * One call per campaign and asset type. Builders run one after the other, because inside an
   * archiving they share its transaction.
   */
  private async resolveEditRoutes(
    targets: readonly EditTarget[],
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const groups = new Map<string, { campaignId: string; assetType: AssetType; assetIds: Set<string> }>();

    for (const { campaignId, assetId, asset } of targets) {
      if (!asset || !this.editRoutes.has(asset.assetType)) {
        continue;
      }

      const key = `${campaignId}:${asset.assetType}`;
      const group = groups.get(key) ?? { campaignId, assetType: asset.assetType, assetIds: new Set() };

      group.assetIds.add(assetId);
      groups.set(key, group);
    }

    const routes = new Map<string, string>();

    for (const { campaignId, assetType, assetIds } of groups.values()) {
      const build = this.editRoutes.get(assetType) as AssetEditRouteBuilder;
      const built = await build({ campaignId, assetIds: [...assetIds] }, db);

      for (const [assetId, route] of built) {
        if (assetIds.has(assetId)) {
          routes.set(editRouteKey(campaignId, assetId), route);
        }
      }
    }

    return routes;
  }

  private toLinkUsageItem(
    link: AssetLinkRow,
    other: AssetRow | undefined,
    otherId: string,
    options: { editRoute: string | null },
  ): AssetUsageItemDto {
    return {
      id: link.id,
      type: link.relationType,
      label: link.label ?? other?.title ?? null,
      assetId: otherId,
      assetType: other?.assetType ?? null,
      editRoute: options.editRoute,
    };
  }

  /** Links are changed through their source, inside the campaign in the path. */
  private assertLinkOfPath(link: AssetLinkRow, path: LinkPath): void {
    if (link.campaignId !== path.campaignId || link.sourceAssetId !== path.sourceAssetId) {
      throw new NotFoundError("Asset link not found");
    }
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("This link already exists");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced asset or campaign not found");
      }

      throw error;
    }
  }
}

function editRouteKey(campaignId: string, assetId: string): string {
  return `${campaignId}:${assetId}`;
}

export function otherEndOf(link: AssetLinkRow, assetId: string): string {
  return link.sourceAssetId === assetId ? link.targetAssetId : link.sourceAssetId;
}
