import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  VersionConflictError,
} from "#core/error/http/index";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { ActionScope, ChangeResult, ListFieldRule } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { isSysAdminRole } from "#core/permissions/roles";
import {
  type CreateAssetBaseDto,
  CreateAssetBaseSchema,
} from "#src/modules/assets/domain/dto/CreateAssetDto";
import type { UpdateAssetMetadataDto } from "#src/modules/assets/domain/dto/UpdateAssetDto";
import type { AssetStatus } from "#src/modules/assets/domain/dto/BaseAssetDto";
import { slugify } from "#src/modules/assets/domain/slugify";
import type { AssetView } from "#src/modules/assets/domain/dto/ResponseAssetDto";
import type {
  AssetRecord,
  AssetRow,
  AssetsRepository,
} from "#src/modules/assets/domain/repository/AssetsRepository";
import {
  createTrackedAsset,
  GM_REVERTIBLE_ASSET_ACTIONS,
  type TrackedAsset,
} from "#src/modules/assets/history/TrackedAsset";

/**
 * Campaign facts the asset module needs; provided by the campaigns module.
 */
export type AssetCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db?: AppDatabase,
  ): Promise<{
    campaignId: string;
    rulesetId: string;
    role: "EDITOR" | "PLAYER" | null;
    isOwner: boolean;
  } | null>;
};

/**
 * Supplies asset ids a player may see in a campaign (e.g. content shares, own characters).
 * Players see nothing unless at least one provider grants visibility.
 */
export type AssetVisibilityProvider = {
  name: string;
  listVisibleAssetIds(
    input: { campaignId: string; actorId: string },
    db: AppDatabase,
  ): Promise<string[]>;
};

/**
 * Lets other modules forbid archiving, for example while an asset is still in use. Runs in the
 * transaction with the asset locked, so it may only use `db`. Throws to reject.
 */
export type AssetArchiveGuard = {
  name: string;
  assertCanArchive(asset: AssetRow, db: AppDatabase): Promise<void>;
};

/**
 * Lets the module owning an asset type clean up when one of its assets stops being active, by draft
 * or by archive, for example by ending what only makes sense for active content. Runs in the same
 * transaction with the asset locked, after the archive guards, on every path: direct changes,
 * undoing and restoring. May only use `db`.
 */
export type AssetDeactivateHook = {
  name: string;
  onDeactivate(asset: AssetRow, db: AppDatabase): Promise<void>;
};

export type CampaignAssetViewer = {
  actorId: string;
  campaignId: string;
  rulesetId: string;
  view: AssetView;
};

type AssetCommandInput = {
  assetId: string;
  expectedVersion: number;
};

const GM_CAMPAIGN_STATUSES: readonly AssetStatus[] = ["DRAFT", "ACTIVE"];
const PLAYER_CAMPAIGN_STATUSES: readonly AssetStatus[] = ["ACTIVE"];

/**
 * Shared identity, lifecycle and catalog resolution for all linkable content.
 *
 * Port methods taking an action scope are meant to be called by domain use cases inside their own
 * action; they do not check domain permissions, which remain the caller's responsibility.
 */
export class AssetsService {
  private readonly visibilityProviders: AssetVisibilityProvider[] = [];
  private readonly archiveGuards: AssetArchiveGuard[] = [];
  private readonly deactivateHooks: AssetDeactivateHook[] = [];
  private readonly gmRevertibleActions = new Set<string>(GM_REVERTIBLE_ASSET_ACTIONS);
  public readonly trackedAsset: TrackedAsset;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: AssetsRepository,
    private readonly campaignAccess: AssetCampaignAccessPort,
  ) {
    this.trackedAsset = createTrackedAsset({
      repository,
      resolveRole: async (campaignId, actorId, tx) => {
        const campaign = await campaignAccess.findCampaignRole(campaignId, actorId, tx);

        return campaign?.isOwner ? "GM" : (campaign?.role ?? null);
      },
      gmRevertibleActions: this.gmRevertibleActions,
      assertCanArchive: async (asset, db) => {
        for (const guard of this.archiveGuards) {
          await guard.assertCanArchive(asset, db);
        }
      },
      onDeactivate: async (asset, db) => {
        for (const hook of this.deactivateHooks) {
          await hook.onDeactivate(asset, db);
        }
      },
    });
  }

  registerVisibilityProvider(provider: AssetVisibilityProvider): void {
    if (this.visibilityProviders.some((existing) => existing.name === provider.name)) {
      throw new Error(`Asset visibility provider '${provider.name}' is already registered`);
    }

    this.visibilityProviders.push(provider);
  }

  registerArchiveGuard(guard: AssetArchiveGuard): void {
    if (this.archiveGuards.some((existing) => existing.name === guard.name)) {
      throw new Error(`Asset archive guard '${guard.name}' is already registered`);
    }

    this.archiveGuards.push(guard);
  }

  registerDeactivateHook(hook: AssetDeactivateHook): void {
    if (this.deactivateHooks.some((existing) => existing.name === hook.name)) {
      throw new Error(`Asset deactivate hook '${hook.name}' is already registered`);
    }

    this.deactivateHooks.push(hook);
  }

  /**
   * For domain modules whose GMs and editors change assets through their own actions: GMs may undo
   * these actions on the asset as well, next to what they may undo anyway.
   */
  allowGmRevert(actions: readonly string[]): void {
    for (const action of actions) {
      this.gmRevertibleActions.add(action);
    }
  }

  /**
   * Adds a list that another module stores for each asset, tracked as a field of the asset. GMs may
   * undo `action`, next to what they may undo anyway.
   */
  registerTrackedList(field: string, rule: ListFieldRule, action: string): void {
    const lists = this.trackedAsset.lists as Record<string, ListFieldRule>;

    if (lists[field]) {
      throw new Error(`Tracked asset list '${field}' is already registered`);
    }

    lists[field] = rule;
    this.gmRevertibleActions.add(action);
  }

  // ---------------------------------------------------------------------------
  // Port for domain modules
  // ---------------------------------------------------------------------------

  /**
   * Changes a list from `registerTrackedList`. `build` gets the list with the asset locked.
   * Archived assets refuse it like every other change.
   */
  async updateTrackedList(
    scope: ActionScope,
    params: {
      assetId: string;
      field: string;
      build(current: readonly string[]): readonly string[];
      baseVersion?: number;
    },
  ): Promise<ChangeResult<AssetRow>> {
    return scope.change(this.trackedAsset, params.assetId, (current) => ({
      set: { [params.field]: params.build(current[params.field] as readonly string[]) },
      ...(params.baseVersion !== undefined ? { baseVersion: params.baseVersion } : {}),
    }));
  }

  async createBase(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateAssetBaseDto,
  ): Promise<AssetRecord> {
    const db = scope.tx;
    const data = CreateAssetBaseSchema.parse(input);
    const isSystem = params.campaignId === null;
    let rulesetIds: string[] = [];

    if (data.rulesetPolicy === "NEUTRAL" && data.rulesetIds?.length) {
      throw new ValidationError("Neutral assets cannot be restricted to rulesets");
    }

    if (isSystem) {
      rulesetIds = data.rulesetPolicy === "RESTRICTED" ? [...new Set(data.rulesetIds ?? [])] : [];
    } else {
      if (data.rulesetIds !== undefined) {
        throw new ValidationError("Campaign assets always use the campaign ruleset");
      }

      const campaign = await this.requireCampaign(db, params.campaignId as string, params.actorId);
      rulesetIds = data.rulesetPolicy === "RESTRICTED" ? [campaign.rulesetId] : [];
    }

    if (data.rulesetPolicy === "RESTRICTED" && rulesetIds.length === 0) {
      throw new ValidationError("Restricted assets require at least one ruleset");
    }

    if (data.assetFamilyId) {
      await this.assertFamilyMatches(db, data.assetFamilyId, data.assetType);
    }

    const slug = data.slug ?? slugify(data.title);

    if (!slug) {
      throw new ValidationError("Asset slug cannot be derived from title");
    }

    const asset = await this.withConstraintErrors(() =>
      scope.create(this.trackedAsset, {
        assetType: data.assetType,
        title: data.title,
        slug,
        summary: data.summary ?? null,
        status: data.status,
        scope: isSystem ? "SYSTEM" : "CAMPAIGN",
        origin: isSystem ? "DEFAULT" : "CUSTOM",
        campaignId: params.campaignId,
        assetFamilyId: data.assetFamilyId ?? null,
        rulesetPolicy: data.rulesetPolicy,
        sourceReference: data.sourceReference ?? null,
        rulesetIds,
      }),
    );

    return { asset, rulesetIds };
  }

  /**
   * Fields the client sent unchanged while somebody else changed them keep the newer value; they
   * are listed in `merged`.
   */
  async updateMetadata(
    scope: ActionScope,
    params: AssetCommandInput & {
      actorId: string;
      patch: Omit<UpdateAssetMetadataDto, "expectedVersion">;
    },
  ): Promise<AssetRecord & Pick<ChangeResult<AssetRow>, "merged">> {
    const db = scope.tx;
    const { rulesetIds, ...fields } = params.patch;

    const { row, merged } = await this.withConstraintErrors(() =>
      scope.change(this.trackedAsset, params.assetId, async (current) => {
        if (current.status === "ARCHIVED") {
          throw new ConflictError("Archived assets cannot be modified");
        }

        if (fields.assetFamilyId) {
          await this.assertFamilyMatches(db, fields.assetFamilyId, current.assetType);
        }

        if (current.scope === "CAMPAIGN" && rulesetIds !== undefined) {
          throw new ValidationError("Campaign assets always use the campaign ruleset");
        }

        const nextPolicy = fields.rulesetPolicy ?? current.rulesetPolicy;

        if (nextPolicy === "NEUTRAL" && rulesetIds?.length) {
          throw new ValidationError("Neutral assets cannot be restricted to rulesets");
        }

        const nextRulesetIds = await this.resolveRulesetIdsForUpdate(db, {
          current,
          nextPolicy,
          rulesetIds,
          actorId: params.actorId,
        });
        const set: Record<string, unknown> = Object.fromEntries(
          Object.entries(fields).filter(([, value]) => value !== undefined),
        );

        if (nextRulesetIds) {
          set.rulesetIds = nextRulesetIds;
        }

        return { set, baseVersion: params.expectedVersion };
      }),
    );

    return { ...(await this.toRecord(db, row)), merged };
  }

  async archiveBase(scope: ActionScope, params: AssetCommandInput): Promise<AssetRecord> {
    const { row } = await scope.change(this.trackedAsset, params.assetId, (current) => {
      if (current.status === "ARCHIVED") {
        throw new ConflictError("Asset is already archived");
      }

      return { set: { status: "ARCHIVED" }, baseVersion: params.expectedVersion };
    });

    return this.toRecord(scope.tx, row);
  }

  /**
   * Brings back the status from before archiving, so a draft stays a draft. Assets archived before
   * the history have no earlier status on record and become active.
   */
  async restoreBase(scope: ActionScope, params: AssetCommandInput): Promise<AssetRecord> {
    const { row } = await scope.change(this.trackedAsset, params.assetId, async (current) => {
      if (current.status !== "ARCHIVED") {
        throw new ConflictError("Only archived assets can be restored");
      }

      // From a version before the archiving, the merge would keep the old status and answer as if
      // the asset had been restored.
      if (params.expectedVersion < current.version) {
        throw new VersionConflictError("The asset was changed by someone else", {
          currentVersion: current.version,
          conflicts: [],
        });
      }

      // Archived assets cannot change, so archiving is always the newest version.
      const before = await scope.valueAt(
        this.trackedAsset,
        params.assetId,
        "status",
        current.version - 1,
      );
      const status = before.known && before.value !== "ARCHIVED" ? before.value : "ACTIVE";

      return { set: { status }, baseVersion: params.expectedVersion };
    });

    return this.toRecord(scope.tx, row);
  }

  /**
   * Loads an asset regardless of status, so archived definitions stay resolvable for existing usages.
   */
  async get(assetId: string, db: AppDatabase = this.db): Promise<AssetRecord | null> {
    const asset = await this.repository.findById(db, assetId);

    return asset ? this.toRecord(db, asset) : null;
  }

  /** Loads assets regardless of status; ids without an asset are missing from the result. */
  async findMany(
    assetIds: readonly string[],
    db: AppDatabase = this.db,
  ): Promise<Map<string, AssetRow>> {
    const rows = await this.repository.findByIds(db, [...new Set(assetIds)]);

    return new Map(rows.map((asset) => [asset.id, asset]));
  }

  /**
   * Keeps assets from being archived until the transaction ends, for callers that make them depend
   * on each other. Does not block other callers of this method.
   */
  async lockForUse(assetIds: readonly string[], db: AppDatabase): Promise<void> {
    await this.repository.lockShared(db, [...new Set(assetIds)]);
  }

  /**
   * Asserts that an asset may be newly selected in a campaign: not archived, owned by the campaign
   * or global, and neutral or compatible with the campaign ruleset.
   */
  async assertAvailable(
    input: { assetId: string; campaignId: string; rulesetId: string },
    db: AppDatabase = this.db,
  ): Promise<AssetRecord> {
    const asset = await this.requireAsset(db, input.assetId);

    this.assertSameCampaign(asset, input.campaignId);

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived assets cannot be selected", { assetId: asset.id });
    }

    if (asset.scope === "SYSTEM" && asset.status !== "ACTIVE") {
      throw new NotFoundError("Asset not found");
    }

    if (!(await this.repository.isCompatible(db, asset.id, input.rulesetId))) {
      throw new ConflictError("Asset is not available for the campaign ruleset", {
        assetId: asset.id,
        rulesetId: input.rulesetId,
      });
    }

    return this.toRecord(db, asset);
  }

  /**
   * Rejects campaign assets that belong to another campaign (reported as 404 to avoid leaking ids).
   */
  assertSameCampaign(asset: AssetRow, campaignId: string): void {
    if (asset.scope === "CAMPAIGN" && asset.campaignId !== campaignId) {
      throw new NotFoundError("Asset not found");
    }
  }

  async resolveVariant(
    input: { assetFamilyId: string; rulesetId: string; campaignId?: string | null },
    db: AppDatabase = this.db,
  ): Promise<AssetRecord | null> {
    const [variant] = await this.repository.listFamilyVariants(db, {
      assetFamilyId: input.assetFamilyId,
      rulesetId: input.rulesetId,
      campaignId: input.campaignId ?? null,
    });

    return variant ? this.toRecord(db, variant) : null;
  }

  // ---------------------------------------------------------------------------
  // Access helpers for HTTP use cases
  // ---------------------------------------------------------------------------

  assertAuthenticated(context: RequestContext): string {
    if (!context.actorId) {
      throw new UnauthenticatedError("Authentication required");
    }

    return context.actorId;
  }

  /**
   * For content that belongs to a campaign without being the asset itself, like links and tags:
   * GMs, editors and administrators may change it. Non-members get 404 so the campaign is not
   * leaked.
   */
  async assertCanEditCampaignContent(
    context: RequestContext,
    campaignId: string,
    db: AppDatabase,
  ): Promise<void> {
    const actorId = this.assertAuthenticated(context);
    const campaign = await this.campaignAccess.findCampaignRole(campaignId, actorId, db);
    const isAdmin = isSysAdminRole(context.systemRole);

    if (!campaign || (!campaign.role && !isAdmin)) {
      throw new NotFoundError("Campaign not found");
    }

    if (campaign.role !== "EDITOR" && !isAdmin) {
      throw new ForbiddenError("Insufficient permissions");
    }
  }

  /**
   * Loads an asset requested in a campaign; what the viewer may not see is reported as 404. Archived
   * global assets stay readable for existing usages, drafts only for administrators.
   */
  async requireReadableInCampaign(
    context: RequestContext,
    viewer: CampaignAssetViewer,
    assetId: string,
    visibleAssetIds: ReadonlySet<string>,
  ): Promise<AssetRow> {
    const asset = await this.requireAsset(this.db, assetId);

    this.assertSameCampaign(asset, viewer.campaignId);

    const hiddenDraft =
      asset.scope === "SYSTEM" && asset.status === "DRAFT" && !isSysAdminRole(context.systemRole);
    const hiddenFromPlayer =
      viewer.view === "PLAYER" && !this.isVisibleToPlayer(asset, visibleAssetIds);

    if (hiddenDraft || hiddenFromPlayer) {
      throw new NotFoundError("Asset not found");
    }

    return asset;
  }

  /** `visibleAssetIds` comes from `listVisibleAssetIds`; active global assets are always visible. */
  isVisibleToPlayer(asset: AssetRow, visibleAssetIds: ReadonlySet<string>): boolean {
    return asset.status === "ACTIVE" && (asset.scope === "SYSTEM" || visibleAssetIds.has(asset.id));
  }

  /** Assets are changed directly through system administration only. */
  assertCanManage(context: RequestContext): void {
    this.assertAuthenticated(context);

    if (!isSysAdminRole(context.systemRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
  }

  /**
   * Administrators may archive and restore every asset, a GM only those of the own campaign.
   * Non-members get 404 so the asset is not leaked.
   */
  async assertCanChangeLifecycle(
    context: RequestContext,
    assetId: string,
    db: AppDatabase,
  ): Promise<void> {
    const actorId = this.assertAuthenticated(context);

    if (isSysAdminRole(context.systemRole)) {
      return;
    }

    const asset = await this.requireAsset(db, assetId);

    if (asset.campaignId === null) {
      throw new ForbiddenError("Insufficient permissions");
    }

    const campaign = await this.campaignAccess.findCampaignRole(asset.campaignId, actorId, db);

    if (!campaign?.role) {
      throw new NotFoundError("Asset not found");
    }

    if (!campaign.isOwner) {
      throw new ForbiddenError("Insufficient permissions");
    }
  }

  /**
   * Resolves whether the actor sees a campaign as GM (admin, owner, editor) or player.
   * Non-members get 404 so campaign existence is not leaked.
   */
  async resolveCampaignViewer(
    context: RequestContext,
    campaignId: string,
  ): Promise<CampaignAssetViewer> {
    const actorId = this.assertAuthenticated(context);
    const campaign = await this.campaignAccess.findCampaignRole(campaignId, actorId, this.db);
    const isAdmin = isSysAdminRole(context.systemRole);

    if (!campaign || (!campaign.role && !isAdmin)) {
      throw new NotFoundError("Campaign not found");
    }

    return {
      actorId,
      campaignId: campaign.campaignId,
      rulesetId: campaign.rulesetId,
      view: isAdmin || campaign.role === "EDITOR" ? "GM" : "PLAYER",
    };
  }

  async listVisibleAssetIds(
    viewer: Pick<CampaignAssetViewer, "campaignId" | "actorId">,
    db: AppDatabase = this.db,
  ): Promise<string[]> {
    const results = await Promise.all(
      this.visibilityProviders.map((provider) =>
        provider.listVisibleAssetIds(
          { campaignId: viewer.campaignId, actorId: viewer.actorId },
          db,
        ),
      ),
    );

    return [...new Set(results.flat())];
  }

  campaignStatusesFor(view: AssetView): readonly AssetStatus[] {
    return view === "GM" ? GM_CAMPAIGN_STATUSES : PLAYER_CAMPAIGN_STATUSES;
  }

  async requireAsset(db: AppDatabase, assetId: string): Promise<AssetRow> {
    const asset = await this.repository.findById(db, assetId);

    if (!asset) {
      throw new NotFoundError("Asset not found");
    }

    return asset;
  }

  async toRecord(db: AppDatabase, asset: AssetRow): Promise<AssetRecord> {
    const rulesetIds = await this.repository.listRulesetIds(db, [asset.id]);

    return { asset, rulesetIds: rulesetIds.get(asset.id) ?? [] };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async requireCampaign(db: AppDatabase, campaignId: string, actorId: string) {
    const campaign = await this.campaignAccess.findCampaignRole(campaignId, actorId, db);

    if (!campaign) {
      throw new NotFoundError("Campaign not found");
    }

    return campaign;
  }

  private async assertFamilyMatches(
    db: AppDatabase,
    assetFamilyId: string,
    assetType: AssetRow["assetType"],
  ): Promise<void> {
    const family = await this.repository.findFamilyById(db, assetFamilyId);

    if (!family) {
      throw new NotFoundError("Asset family not found");
    }

    if (family.assetType !== assetType) {
      throw new ConflictError("Asset family belongs to a different asset type", {
        assetFamilyId,
        familyAssetType: family.assetType,
        assetType,
      });
    }
  }

  /**
   * Returns the ruleset ids after a metadata update, or null when links stay unchanged.
   */
  private async resolveRulesetIdsForUpdate(
    db: AppDatabase,
    input: {
      current: AssetRow;
      nextPolicy: AssetRow["rulesetPolicy"];
      rulesetIds: string[] | undefined;
      actorId: string;
    },
  ): Promise<string[] | null> {
    const policyChanged = input.nextPolicy !== input.current.rulesetPolicy;

    if (input.nextPolicy === "NEUTRAL") {
      return policyChanged || input.rulesetIds !== undefined ? [] : null;
    }

    if (input.current.scope === "SYSTEM") {
      return input.rulesetIds ?? null;
    }

    if (!policyChanged) {
      return null;
    }

    const campaign = await this.requireCampaign(
      db,
      input.current.campaignId as string,
      input.actorId,
    );

    return [campaign.rulesetId];
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("Asset slug is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced ruleset, campaign or asset family not found");
      }

      throw error;
    }
  }
}
