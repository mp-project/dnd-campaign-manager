import type { FastifyBaseLogger } from "fastify";
import {
  campaignRoleOf,
  type ContentView,
  type ContentViewer,
  contentViewOf,
} from "#core/content/viewer";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
  VersionConflictError,
} from "#core/error/http/index";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import { isDatabaseBusyError } from "#core/error/databaseBusy";
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
import type {
  AssetRecord,
  AssetRow,
  AssetsRepository,
} from "#src/modules/assets/domain/repository/AssetsRepository";
import {
  assertReleasable,
  createTrackedAsset,
  OWNER_REVERTIBLE_ASSET_ACTIONS,
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
 * Supplies the assets a campaign still uses, e.g. the classes and features its characters have.
 * Archived content stays readable in the campaign while it is in use (but cannot be chosen anew);
 * otherwise it leaves the catalog. Nothing is in use unless a provider says so.
 */
export type AssetInUseProvider = {
  name: string;
  listInUseAssetIds(input: { campaignId: string }, db: AppDatabase): Promise<string[]>;
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

/**
 * Lets the module owning an asset type check that an asset may come back when it leaves `ARCHIVED`
 * (to draft or active), for example that the assets its definition refers to are still available:
 * archived content does not keep its targets from being archived. Runs in the same transaction with
 * the asset locked, on every path: restore routes, undoing and restoring versions. May only use
 * `db`. Throws to reject.
 */
export type AssetReactivateHook = {
  name: string;
  onReactivate(asset: AssetRow, db: AppDatabase): Promise<void>;
};

/** An asset a definition (class, species …) refers to, with where and which types are allowed. */
export type AssetReference = {
  assetId: string;
  path: (string | number)[];
  assetTypes: readonly AssetRow["assetType"][];
};

export type AssetReferenceIssue = { path: (string | number)[]; message: string };

type AssetCommandInput = {
  assetId: string;
  expectedVersion: number;
};

const FULL_VIEW_CAMPAIGN_STATUSES: readonly AssetStatus[] = ["DRAFT", "ACTIVE"];
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
  private readonly reactivateHooks: AssetReactivateHook[] = [];
  private readonly inUseProviders: AssetInUseProvider[] = [];
  private readonly ownerRevertibleActions = new Set<string>(OWNER_REVERTIBLE_ASSET_ACTIONS);
  private readonly releasableTypes = new Set<AssetRow["assetType"]>();
  public readonly trackedAsset: TrackedAsset;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: AssetsRepository,
    private readonly campaignAccess: AssetCampaignAccessPort,
    private readonly logger: Pick<FastifyBaseLogger, "error">,
  ) {
    this.trackedAsset = createTrackedAsset({
      repository,
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      ownerRevertibleActions: this.ownerRevertibleActions,
      isReleasable: (assetType) => this.releasableTypes.has(assetType),
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
      onReactivate: async (asset, db) => {
        for (const hook of this.reactivateHooks) {
          await hook.onReactivate(asset, db);
        }
      },
    });
  }

  /**
   * Rule content modules (features, classes, spells …) register their type, so custom assets of it
   * can be released to the players of their campaign. Released active assets are visible to every
   * player of the campaign; story content uses content shares instead.
   */
  registerReleasableType(assetType: AssetRow["assetType"]): void {
    if (this.releasableTypes.has(assetType)) {
      throw new Error(`Asset type '${assetType}' is already releasable`);
    }

    if (this.releasableTypes.size === 0) {
      this.registerVisibilityProvider({
        name: "released",
        listVisibleAssetIds: (input, db) =>
          this.repository.listReleasedIds(db, input.campaignId),
      });
    }

    this.releasableTypes.add(assetType);
  }

  isReleasable(assetType: AssetRow["assetType"]): boolean {
    return this.releasableTypes.has(assetType);
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

  registerInUseProvider(provider: AssetInUseProvider): void {
    if (this.inUseProviders.some((existing) => existing.name === provider.name)) {
      throw new Error(`Asset in-use provider '${provider.name}' is already registered`);
    }

    this.inUseProviders.push(provider);
  }

  /**
   * Assets the campaign still uses, see `AssetInUseProvider`. A provider that fails on its own is
   * logged and counts as "nothing in use", so its archived content is hidden instead of every read
   * failing; that never shows more than before. A busy database (503) and every failure inside a
   * transaction, which Postgres would abort anyway, are thrown.
   */
  async listInUseAssetIds(campaignId: string, db: AppDatabase = this.db): Promise<Set<string>> {
    const results = await Promise.allSettled(
      this.inUseProviders.map((provider) => provider.listInUseAssetIds({ campaignId }, db)),
    );
    const ids = new Set<string>();

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        result.value.forEach((id) => ids.add(id));

        return;
      }

      if (db !== this.db || isDatabaseBusyError(result.reason)) {
        throw result.reason;
      }

      this.logger.error(
        { err: result.reason, provider: this.inUseProviders[index]?.name, campaignId },
        "Asset in-use provider failed",
      );
    });

    return ids;
  }

  /**
   * Whether a player may see the asset in the campaign: active and visible as before, or archived
   * and still in use there.
   */
  isVisibleToPlayerInCampaign(
    asset: AssetRow,
    visibleAssetIds: ReadonlySet<string>,
    inUseAssetIds: ReadonlySet<string>,
  ): boolean {
    return (
      this.isVisibleToPlayer(asset, visibleAssetIds) ||
      (asset.status === "ARCHIVED" && inUseAssetIds.has(asset.id))
    );
  }

  registerReactivateHook(hook: AssetReactivateHook): void {
    if (this.reactivateHooks.some((existing) => existing.name === hook.name)) {
      throw new Error(`Asset reactivate hook '${hook.name}' is already registered`);
    }

    this.reactivateHooks.push(hook);
  }

  /**
   * For domain modules whose owners and editors change assets through their own actions: owners may
   * undo these actions on the asset as well, next to what they may undo anyway.
   */
  allowOwnerRevert(actions: readonly string[]): void {
    for (const action of actions) {
      this.ownerRevertibleActions.add(action);
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
    this.ownerRevertibleActions.add(action);
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

    if (data.releasedToPlayers) {
      assertReleasable(
        { scope: isSystem ? "SYSTEM" : "CAMPAIGN", assetType: data.assetType },
        (assetType) => this.releasableTypes.has(assetType),
      );
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
        releasedToPlayers: data.releasedToPlayers,
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
   * Checks the assets a stored definition refers to, for rule content modules. `missing` holds
   * unknown assets, assets of other campaigns and unpublished global ones (404 for the caller);
   * `issues` wrong types, self references, archived and incompatible assets (409). A global owner
   * may only refer to active global assets that cover all of its rulesets; a campaign owner to its
   * own assets and active global ones, compatible with the campaign ruleset.
   */
  async collectReferenceIssues(
    db: AppDatabase,
    owner: { assetId: string; campaignId: string | null; campaignRulesetId: string | null },
    references: readonly AssetReference[],
  ): Promise<{ missing: AssetReferenceIssue[]; issues: AssetReferenceIssue[] }> {
    const missing: AssetReferenceIssue[] = [];
    const issues: AssetReferenceIssue[] = [];

    if (references.length === 0) {
      return { missing, issues };
    }

    const referenced = await this.findMany(
      references.map((reference) => reference.assetId),
      db,
    );
    const ownRulesets = owner.campaignId === null ? await this.ownRulesets(db, owner.assetId) : null;

    for (const reference of references) {
      const target = referenced.get(reference.assetId);
      const report = (message: string) => issues.push({ path: reference.path, message });

      if (!target || (target.campaignId !== null && target.campaignId !== owner.campaignId)) {
        missing.push({ path: reference.path, message: "Asset not found" });
        continue;
      }

      if (!reference.assetTypes.includes(target.assetType)) {
        report(`Expected an asset of type ${reference.assetTypes.join(" or ")}`);
        continue;
      }

      if (target.id === owner.assetId) {
        report("An asset cannot refer to itself");
        continue;
      }

      if (target.status === "ARCHIVED") {
        report("The asset is archived");
        continue;
      }

      if (owner.campaignId === null) {
        if (target.scope !== "SYSTEM" || target.status !== "ACTIVE") {
          report("Global content can only refer to active global assets");
        } else if (!(await this.coversRulesets(db, target, ownRulesets))) {
          report("The asset is not available for all rulesets of the referring content");
        }

        continue;
      }

      if (target.scope === "SYSTEM" && target.status !== "ACTIVE") {
        missing.push({ path: reference.path, message: "Asset not found" });
        continue;
      }

      if (
        owner.campaignRulesetId &&
        !(await this.repository.isCompatible(db, target.id, owner.campaignRulesetId))
      ) {
        report("The asset is not available for the campaign ruleset");
      }
    }

    return { missing, issues };
  }

  /** Rulesets of an asset; null for a neutral one, which fits every ruleset. */
  async ownRulesets(db: AppDatabase, assetId: string): Promise<string[] | null> {
    const asset = await this.requireAsset(db, assetId);

    if (asset.rulesetPolicy === "NEUTRAL") {
      return null;
    }

    return (await this.repository.listRulesetIds(db, [assetId])).get(assetId) ?? [];
  }

  /** A neutral target fits everything; a restricted one must cover every given ruleset. */
  private async coversRulesets(
    db: AppDatabase,
    target: AssetRow,
    rulesets: readonly string[] | null,
  ): Promise<boolean> {
    if (target.rulesetPolicy === "NEUTRAL") {
      return true;
    }

    if (rulesets === null) {
      return false;
    }

    const targetRulesets = new Set(
      (await this.repository.listRulesetIds(db, [target.id])).get(target.id) ?? [],
    );

    return rulesets.every((rulesetId) => targetRulesets.has(rulesetId));
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
    viewer: ContentViewer,
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
   * Resolves who looks at a campaign: role, administrator and with that the view (full for owner,
   * editors and administrators, player otherwise). Non-members get 404 so campaign existence is
   * not leaked.
   */
  async resolveCampaignViewer(context: RequestContext, campaignId: string): Promise<ContentViewer> {
    const actorId = this.assertAuthenticated(context);
    const campaign = await this.campaignAccess.findCampaignRole(campaignId, actorId, this.db);
    const isAdmin = isSysAdminRole(context.systemRole);
    const campaignRole = campaignRoleOf(campaign);

    if (!campaign || (!campaignRole && !isAdmin)) {
      throw new NotFoundError("Campaign not found");
    }

    return {
      actorId,
      isAdmin,
      campaignId: campaign.campaignId,
      rulesetId: campaign.rulesetId,
      campaignRole,
      view: contentViewOf({ isAdmin, campaignRole }),
    };
  }

  async listVisibleAssetIds(
    viewer: Pick<ContentViewer, "campaignId" | "actorId">,
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

  campaignStatusesFor(view: ContentView): readonly AssetStatus[] {
    return view === "FULL" ? FULL_VIEW_CAMPAIGN_STATUSES : PLAYER_CAMPAIGN_STATUSES;
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
