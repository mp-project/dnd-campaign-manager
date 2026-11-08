import type { SQL } from "drizzle-orm";
import type { ZodType } from "zod";
import type { ContentReadPurpose } from "#core/content/access";
import { type ContentWriteAction, decideContentWrite } from "#core/content/writeAccess";
import {
  campaignRoleOf,
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
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import type { ActionScope, ActionVerifier, ChangeResult, ListFieldRule } from "#core/history/types";
import type { CampaignRole, RequestContext } from "#core/http/requestContext";
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
  ASSET_ENTITY_TYPE,
  assertReleasable,
  createTrackedAsset,
  CAMPAIGN_REVERTIBLE_ASSET_ACTIONS,
  type TrackedAsset,
} from "#src/modules/assets/history/TrackedAsset";
import { ContentAccess } from "#src/modules/assets/service/ContentAccess";

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

/**
 * What the module owning an asset type tells the content kernel about it. Only what cannot be
 * derived from elsewhere belongs here (tables, routes and rights already say the rest).
 */
/**
 * Version of the rules behind `asset_references`. Raise it when a content type changes what it
 * reports as references; the app then rebuilds the index once when it starts.
 */
export const CONTENT_REFERENCE_INDEX_VERSION = 1;

/** A place in stored content that refers to another asset. */
export type ContentReference = {
  assetId: string;
  path: readonly (string | number)[];
  /** What kind of reference, e.g. `SUPERSEDES`; usages show it as `<source type>_<kind>`. */
  kind: string;
  /** Properties the target must not have (see `ContentTypeDefinition.properties`). */
  forbids?: readonly string[] | undefined;
};

/** Something content is or does that a reference may forbid, e.g. raising ability scores. */
export type ContentProperty = {
  code: string;
  /** Completes "Referring content forbids that this asset …", e.g. "raises ability scores". */
  phrase: string;
};

/** How a module shows its content to players: for shares and previews. */
export type ContentPlayerView = {
  /** Player response of the module; use `z.object` to drop extra fields, `z.strictObject` to fail. */
  schema: ZodType;
  load(
    input: { campaignId: string; assetId: string; actorId: string },
    db: AppDatabase,
  ): Promise<unknown>;
};

/**
 * Builds the edit routes of assets of the type, for all assets of one request at once, so the
 * module can look up its own ids in one query. `campaignId` null asks for global content (see
 * `editRoutePrefix` of asset-links). Assets without a route are left out.
 */
export type ContentEditRoutes = (
  input: { campaignId: string | null; assetIds: readonly string[] },
  db: AppDatabase,
) => ReadonlyMap<string, string> | Promise<ReadonlyMap<string, string>>;

/**
 * How players get content of the type. `RULE` (features, classes, spells …): global content is
 * there for every campaign of a fitting ruleset, custom content once released to the players of
 * its campaign. `STORY` (notes, locations, NPCs …): revealed through content shares, so it needs a
 * player view; `assertShareable` may refuse single assets.
 */
export type ContentKind =
  | { kind: "RULE"; playerView?: ContentPlayerView }
  | {
      kind: "STORY";
      playerView: ContentPlayerView;
      assertShareable?(asset: AssetRow, db: AppDatabase): Promise<void>;
    };

export type ContentTypeDefinition = ContentKind & {
  assetType: AssetRow["assetType"];
  editRoutes: ContentEditRoutes;
  /**
   * Actions of the module that change the asset (its name, status …). Those who may change the
   * content may also undo them in the history of the asset, next to archiving and restoring.
   */
  revertibleActions?: readonly string[];
  /**
   * The assets the stored content refers to, for archived content as well. The kernel keeps them
   * in `asset_references` at the end of every action, so usages, archive blocking and what is in
   * use come from one query instead of searches in every module. Null when the stored content
   * no longer parses: the index then keeps its rows. Only real references: values
   * that merely look like ids are no references.
   */
  references?(asset: AssetRow, db: AppDatabase): Promise<readonly ContentReference[] | null>;
  /**
   * Content of this type uses what it refers to, like a character its class: archived content it
   * refers to stays readable in the campaign (for those who may read the user) while the user is
   * not archived. Rule content that merely refers to other rules does not count.
   */
  usesContent?: boolean;
  /**
   * What the content currently is or does that referring content may forbid (`forbids` of its
   * references). The kernel checks it at the end of every action that touched the content, so a
   * change can't break the rules of content that refers to it.
   */
  properties?(asset: AssetRow, db: AppDatabase): Promise<readonly ContentProperty[]>;
  /**
   * Checks the content as it is at the end of an action that touched it (its asset or any row
   * whose history root is the asset), in the transaction of the action: references, unique codes
   * and every other rule that spans several rows. Runs for every action, undoing and restoring
   * included, and not for archived content, which keeps nothing from changing. Throws an AppError.
   */
  verify?(asset: AssetRow, db: AppDatabase): Promise<void>;
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
  private readonly contentTypes = new Map<AssetRow["assetType"], ContentTypeDefinition>();
  private readonly campaignRevertibleActions = new Set<string>(CAMPAIGN_REVERTIBLE_ASSET_ACTIONS);
  private readonly releasableTypes = new Set<AssetRow["assetType"]>();
  public readonly trackedAsset: TrackedAsset;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: AssetsRepository,
    private readonly campaignAccess: AssetCampaignAccessPort,
  ) {
    this.trackedAsset = createTrackedAsset({
      repository,
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      campaignRevertibleActions: this.campaignRevertibleActions,
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
    });
  }

  /** Released active custom rule content is visible to every player of its campaign. */
  private enableRelease(assetType: AssetRow["assetType"]): void {
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

  /**
   * Builds `asset_references` again from the stored content of every registered type, e.g. to
   * repair it. Each asset is locked while its references are rebuilt, so an action that changes
   * it meanwhile can't be overwritten with older references. Returns how many assets were read.
   */
  async rebuildReferences(): Promise<number> {
    return this.transactionManager.inTransaction((tx) => this.rebuildReferencesIn(tx));
  }

  /**
   * Run once when the app starts: rebuilds the reference index when the stored index version is
   * older than `CONTENT_REFERENCE_INDEX_VERSION`, e.g. after the migration that added it or after
   * the rules of a type's references changed. An advisory lock keeps several app instances from
   * doing it at the same time; the others wait and then find the version current.
   */
  async ensureReferenceIndex(): Promise<boolean> {
    return this.transactionManager.inTransaction(async (tx) => {
      await this.repository.lockReferenceIndex(tx);

      if ((await this.repository.findReferenceIndexVersion(tx)) === CONTENT_REFERENCE_INDEX_VERSION) {
        return false;
      }

      await this.rebuildReferencesIn(tx);
      await this.repository.updateReferenceIndexVersion(tx, CONTENT_REFERENCE_INDEX_VERSION);

      return true;
    });
  }

  private async rebuildReferencesIn(tx: AppDatabase): Promise<number> {
    const assetTypes = [...this.contentTypes.values()]
      .filter((type) => type.references)
      .map((type) => type.assetType);
    const ids = await this.repository.listIdsOfTypes(tx, assetTypes);

    for (const id of ids) {
      const asset = await this.repository.findByIdForUpdate(tx, id);

      if (asset) {
        await this.storeReferences(asset, tx);
      }
    }

    return ids.length;
  }

  /**
   * Refuses a state of the asset that non-archived content referring to it forbids, e.g. a feature
   * that starts raising ability scores while a 2024 species grants it.
   */
  private async assertAllowedByReferrers(asset: AssetRow, db: AppDatabase): Promise<void> {
    const properties = (await this.contentTypes.get(asset.assetType)?.properties?.(asset, db)) ?? [];

    if (properties.length === 0) {
      return;
    }

    const issues = (await this.repository.listReferencing(db, asset.id)).flatMap(
      ({ source, reference }) =>
        source.status === "ARCHIVED"
          ? []
          : properties
              .filter((property) => reference.forbids.includes(property.code))
              .map((property) => ({
                assetId: source.id,
                assetType: source.assetType,
                name: source.title,
                path: reference.path,
                property: property.code,
                phrase: property.phrase,
              })),
    );

    if (issues.length > 0) {
      const phrases = [...new Set(issues.map((issue) => issue.phrase))].join(" or ");

      throw new ConflictError(`Referring content forbids that this asset ${phrases}`, {
        assetId: asset.id,
        usages: issues.map(({ assetId, assetType, name, path, property }) => ({
          assetId,
          assetType,
          name,
          path,
          property,
        })),
      });
    }
  }

  private async storeReferences(asset: AssetRow, db: AppDatabase): Promise<void> {
    const type = this.contentTypes.get(asset.assetType);

    if (!type?.references) {
      return;
    }

    const references = await type.references(asset, db);

    // A stored definition that no longer parses: keep what the index knew instead of losing it.
    if (references === null) {
      return;
    }

    await this.repository.replaceReferences(
      db,
      asset.id,
      references.map((reference) => ({
        targetAssetId: reference.assetId,
        path: reference.path.join("."),
        kind: reference.kind,
        forbids: reference.forbids ?? [],
      })),
    );
  }

  /**
   * The one registration of a content type: what the module tells the kernel about it (see
   * `ContentTypeDefinition`). Release, shares, edit routes, undo rights, references and checks all
   * read it from here.
   */
  getContentType(assetType: AssetRow["assetType"]): ContentTypeDefinition | undefined {
    return this.contentTypes.get(assetType);
  }

  registerContentType(type: ContentTypeDefinition): void {
    if (this.contentTypes.has(type.assetType)) {
      throw new Error(`Content type '${type.assetType}' is already registered`);
    }

    if (type.kind === "RULE") {
      this.enableRelease(type.assetType);
    }

    for (const action of type.revertibleActions ?? []) {
      this.campaignRevertibleActions.add(action);
    }

    this.contentTypes.set(type.assetType, type);
  }

  /**
   * Verifies the content an action touched, once at its end (see `ContentTypeDefinition.verify`).
   * Registered with the history as an action verifier by the assets module.
   */
  readonly contentVerifier: ActionVerifier = {
    name: "content",
    verify: async (touched, db) => {
      const assetIds = new Set(
        touched.flatMap((item) => {
          if (item.entityType === ASSET_ENTITY_TYPE) {
            return [item.entityId];
          }

          return item.root?.type === ASSET_ENTITY_TYPE ? [item.root.id] : [];
        }),
      );
      // Sorted, so concurrent actions take the locks of the checks in the same order.
      const touchedAssets = (await this.repository.findByIds(db, [...assetIds])).sort((a, b) =>
        a.id.localeCompare(b.id),
      );

      const existing = new Set(touchedAssets.map((asset) => asset.id));

      // Deleted assets refer to nothing any more.
      await this.repository.deleteReferences(
        db,
        [...assetIds].filter((id) => !existing.has(id)),
      );

      for (const asset of touchedAssets) {
        const type = this.contentTypes.get(asset.assetType);

        if (asset.status !== "ARCHIVED") {
          await type?.verify?.(asset, db);
          await this.assertAllowedByReferrers(asset, db);
        }

        await this.storeReferences(asset, db);
      }
    },
  };




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
    this.campaignRevertibleActions.add(action);
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
   * Throws unless the actor may do this with content of the campaign, or with global content when
   * `campaignId` is null; the rule is `decideContentWrite`. Unknown campaigns and non-members get
   * 404 with `notFoundMessage`, so nothing is leaked; members without the right get 403. Runs in
   * the transaction of the action when given its handle. Returns the actor id.
   */
  async assertCanWrite(
    context: RequestContext,
    action: ContentWriteAction,
    campaignId: string | null,
    db: AppDatabase,
    notFoundMessage = "Campaign not found",
  ): Promise<string> {
    const actorId = this.assertAuthenticated(context);
    const isAdmin = isSysAdminRole(context.systemRole);
    let campaignRole: CampaignRole | null = null;

    if (campaignId !== null) {
      const campaign = await this.campaignAccess.findCampaignRole(campaignId, actorId, db);

      if (!campaign) {
        throw new NotFoundError(notFoundMessage);
      }

      campaignRole = campaignRoleOf(campaign);
    }

    const decision = decideContentWrite({ isAdmin, campaignRole }, action, { campaignId });

    if (decision === "NOT_FOUND") {
      throw new NotFoundError(notFoundMessage);
    }

    if (decision === "FORBIDDEN") {
      throw new ForbiddenError("Insufficient permissions");
    }

    return actorId;
  }

  /** Loads an asset requested in a campaign; what the viewer may not read is reported as 404. */
  async requireReadable(
    access: ContentAccess,
    assetId: string,
    purpose: ContentReadPurpose = "READ",
  ): Promise<AssetRow> {
    return access.require(purpose, await this.repository.findById(this.db, assetId));
  }

  /** Assets are changed directly through system administration only. */
  assertCanManage(context: RequestContext): void {
    this.assertAuthenticated(context);

    if (!isSysAdminRole(context.systemRole)) {
      throw new ForbiddenError("Insufficient permissions");
    }
  }

  /** Archiving and restoring an asset directly; see `assertCanWrite`. */
  async assertCanChangeLifecycle(
    context: RequestContext,
    assetId: string,
    db: AppDatabase,
  ): Promise<void> {
    const asset = await this.requireAsset(db, assetId);

    await this.assertCanWrite(context, "CHANGE_LIFECYCLE", asset.campaignId, db, "Asset not found");
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

  /**
   * The read access of the actor in the campaign for this request; see `ContentAccess`. Non-members
   * get 404. Load it once per request and pass it on instead of loading grants again.
   */
  async access(context: RequestContext, campaignId: string): Promise<ContentAccess> {
    return this.accessFor(await this.resolveCampaignViewer(context, campaignId));
  }

  /**
   * Global content outside a campaign, as a condition on `assets` for the global list routes:
   * administrators get drafts and active content (archived when asked for), everybody else active
   * content only. `rulesetId` narrows it to what fits that ruleset.
   */
  globalListWhere(
    context: RequestContext,
    filter: { status?: AssetStatus | undefined; rulesetId?: string | undefined },
    db: AppDatabase = this.db,
  ): SQL {
    const statuses: readonly AssetStatus[] = isSysAdminRole(context.systemRole)
      ? filter.status
        ? [filter.status]
        : ["DRAFT", "ACTIVE"]
      : filter.status === undefined || filter.status === "ACTIVE"
        ? ["ACTIVE"]
        : [];

    return this.repository.globalWhere(db, { statuses, rulesetId: filter.rulesetId });
  }

  /**
   * `access` for a viewer that is already resolved. Inside a transaction, pass its handle: the
   * grants are then read in it, and a failing provider fails the transaction.
   *
   * Archived content stays readable while the campaign uses it: while content of a type that
   * `usesContent` (characters, NPCs) and is not archived refers to it. The viewer must be able to
   * read that content too, so a player sees the archived class of a character they see, but not
   * what an NPC only the game master knows uses.
   */
  async accessFor(viewer: ContentViewer, db: AppDatabase = this.db): Promise<ContentAccess> {
    const deps = { db: this.db, repository: this.repository };
    const [visibleIds, uses] = await Promise.all([
      viewer.view === "PLAYER" ? this.listVisibleAssetIds(viewer, db) : [],
      this.repository.listUsedTargets(db, viewer.campaignId, [...this.usingTypes()]),
    ]);
    const visibleAssetIds = new Set(visibleIds);
    const readableUsers =
      viewer.view === "FULL"
        ? new Set(uses.map(({ source }) => source.id))
        : await new ContentAccess(viewer, visibleAssetIds, new Set(), deps).readableIds(
            "READ",
            uses.map(({ source }) => source),
            db,
          );
    const inUseAssetIds = new Set(
      uses.filter(({ source }) => readableUsers.has(source.id)).map(({ targetAssetId }) => targetAssetId),
    );

    return new ContentAccess(viewer, visibleAssetIds, inUseAssetIds, deps);
  }

  /** Types whose references keep archived content in use. */
  private usingTypes(): Set<AssetRow["assetType"]> {
    return new Set(
      [...this.contentTypes.values()].filter((type) => type.usesContent).map((type) => type.assetType),
    );
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
