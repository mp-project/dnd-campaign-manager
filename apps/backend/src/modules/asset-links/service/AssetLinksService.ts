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
  ContentEditRoutes,
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
};

/** Edit routes of a campaign start with the campaign; those of global content (null) don't. */
export function editRoutePrefix(campaignId: string | null): string {
  return campaignId === null ? "" : `/campaigns/${campaignId}`;
}

/** An asset that may get an edit route, in a campaign or (null) as global content. */
type EditTarget = { campaignId: string | null; assetId: string; asset: AssetRow | undefined };

type LinkPath = { campaignId: string; sourceAssetId: string; linkId: string };

/**
 * Relations between assets and the view on where an asset is used.
 *
 * Methods taking an action scope are meant to be called by use cases inside their own action, also
 * those of domain modules; they do not check rights, which remain the caller's responsibility.
 */
export class AssetLinksService {
  private readonly usageProviders: AssetUsageProvider[] = [];
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

    // Content that refers to the asset keeps it, unless that content is archived itself.
    blocking.push(
      ...(await this.referenceUsages(asset.id, db, {
        sources: async (sources) => sources.filter((source) => source.status !== "ARCHIVED"),
        mayEdit: () => true,
      })),
    );

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

    usages.typedUsages.push(
      ...(await this.referenceUsages(assetId, this.db, {
        campaignId: viewer.campaignId,
        sources: (sources) => access.filter("READ", sources),
        mayEdit,
      })),
    );

    for (const { group, item } of provided.items) {
      const related = item.assetId ? providedAssets.get(item.assetId) : undefined;

      // Items without an asset only go to the full view.
      if (related ? !readable.has(related.id) : !access.isFullView) {
        continue;
      }

      // An item about the asset itself (a share) edits something of the campaign, not the asset.
      // Items without an asset belong to the campaign (an outline entry); their provider decides.
      const keepsRoute =
        access.isFullView && (related === undefined || item.assetId === assetId || mayEdit(related));

      usages[group].push(keepsRoute ? item : { ...item, editRoute: null });
    }

    return usages;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Usages from the reference index: one item per asset whose stored content refers to this one,
   * typed `<source type>_<kind of its first reference>` in the order the module reports them, after `sources` filtered them. Edit
   * routes only where `mayEdit` allows them.
   */
  private async referenceUsages(
    assetId: string,
    db: AppDatabase,
    options: {
      /** Only referrers of this campaign and global ones; all of them without it. */
      campaignId?: string;
      sources(sources: AssetRow[]): Promise<AssetRow[]>;
      mayEdit(source: AssetRow): boolean;
    },
  ): Promise<AssetUsageItemDto[]> {
    const firstKind = new Map<string, { source: AssetRow; kind: string }>();

    const rows = await this.assets.repository.listReferencing(db, assetId, {
      campaignId: options.campaignId,
    });

    for (const { source, reference } of rows) {
      if (!firstKind.has(source.id)) {
        firstKind.set(source.id, { source, kind: reference.kind });
      }
    }

    const sources = await options.sources([...firstKind.values()].map(({ source }) => source));
    const editRoutes = await this.resolveEditRoutes(
      sources
        .filter((source) => options.mayEdit(source))
        .map((source) => ({ campaignId: source.campaignId, assetId: source.id, asset: source })),
      db,
    );

    return sources.map((source) => ({
      id: source.id,
      type: `${source.assetType}_${firstKind.get(source.id)?.kind ?? "REFERENCE"}`,
      label: source.title,
      assetId: source.id,
      assetType: source.assetType,
      editRoute: editRoutes.get(editRouteKey(source.campaignId, source.id)) ?? null,
    }));
  }

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
    const groups = new Map<
      string,
      { campaignId: string | null; assetType: AssetType; assetIds: Set<string> }
    >();

    for (const { campaignId, assetId, asset } of targets) {
      if (!asset || !this.assets.getContentType(asset.assetType)?.editRoutes) {
        continue;
      }

      const key = `${campaignId}:${asset.assetType}`;
      const group = groups.get(key) ?? { campaignId, assetType: asset.assetType, assetIds: new Set() };

      group.assetIds.add(assetId);
      groups.set(key, group);
    }

    const routes = new Map<string, string>();

    for (const { campaignId, assetType, assetIds } of groups.values()) {
      const build = this.assets.getContentType(assetType)?.editRoutes as ContentEditRoutes;
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

function editRouteKey(campaignId: string | null, assetId: string): string {
  return `${campaignId ?? "global"}:${assetId}`;
}

export function otherEndOf(link: AssetLinkRow, assetId: string): string {
  return link.sourceAssetId === assetId ? link.targetAssetId : link.sourceAssetId;
}
