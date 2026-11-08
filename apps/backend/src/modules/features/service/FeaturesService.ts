import type { ContentReadPurpose } from "#core/content/access";
import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError } from "#core/error/http/index";
import type { ActionScope, HistoryEvent } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { UUID_PATTERN } from "#core/uuid";
import type { AssetLinksService, AssetUsageItemDto } from "#src/modules/asset-links/index";
import {
  type AssetRow,
  type AssetsService,
  type ContentAccess,
  slugify,
} from "#src/modules/assets/index";
import type { CreateFeatureDto } from "#src/modules/features/domain/dto/CreateFeatureDto";
import type { FeatureGraph } from "#src/modules/features/domain/dto/FeatureDefinitionDto";
import type { UpdateFeatureDto } from "#src/modules/features/domain/dto/UpdateFeatureDto";
import {
  collectAssetReferences,
  type DefinitionIssue,
  raisesAbilityScore,
  usesClassLevel,
} from "#src/modules/features/domain/FeatureDefinition";
import {
  type ActorSnapshot,
  evaluateFeatureEffects,
  type EvaluatedEffects,
  FeatureBindingError,
  type FeatureBindings,
  resolveFeatureGraph,
  type ResolvedFeatureGraph,
} from "#src/modules/features/domain/FeatureResolver";
import { FEATURE_GRAPH_PARTS } from "#src/modules/features/domain/entities/FeaturesTable";
import type {
  FeatureRecord,
  FeatureRow,
  FeaturesRepository,
  FeatureWithAsset,
} from "#src/modules/features/domain/repository/FeaturesRepository";
import {
  createTrackedFeature,
  FEATURE_ENTITY_TYPE,
  parseFeatureGraph,
  type TrackedFeature,
} from "#src/modules/features/history/TrackedFeature";
import { FeatureResolutionCache } from "#src/modules/features/service/FeatureResolutionCache";

/** Campaign facts the module needs; provided by the campaigns module. */
export type FeatureCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
  findRulesetId(campaignId: string, db: AppDatabase): Promise<string | null>;
};

const ASSET_FIELD_NAMES: Record<string, string> = { title: "name" };
const ASSET_FIELDS = [
  "releasedToPlayers",
  "name",
  "summary",
  "status",
  "sourceReference",
  "rulesetPolicy",
  "rulesetIds",
  "assetFamilyId",
] as const;

/** Upper bound of supersede steps followed when looking for cycles. */
const MAX_SUPERSEDE_CHAIN = 200;

/** See `FeaturesService.inspectFeatures`. */
export type FeatureInspection =
  | {
      valid: true;
      parameters: FeatureGraph["parameters"];
      raisesAbilityScore: boolean;
      usesClassLevel: boolean;
    }
  | { valid: false };

/** See `FeaturesService.registerChangeGuard`. */
export type FeatureChangeGuard = (
  change: { assetId: string; campaignId: string | null; graph: FeatureGraph },
  db: AppDatabase,
) => Promise<void>;

/**
 * Feature definitions: global ones, maintained by administrators per ruleset, and custom ones of a
 * campaign. Each feature is an asset of type `FEATURE`; the asset holds name, summary, status and
 * rulesets, the feature row the definition. The service computes values only; source modules store
 * grants and bindings and change actor state themselves.
 */
export class FeaturesService {
  public readonly trackedFeature: TrackedFeature;
  public readonly cache = new FeatureResolutionCache();
  private readonly changeGuards: FeatureChangeGuard[] = [];

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: FeaturesRepository,
    private readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    private readonly campaignAccess: FeatureCampaignAccessPort,
  ) {
    this.trackedFeature = createTrackedFeature({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (row, tx) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived features cannot be modified", { assetId: asset.id });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireFeature(db: AppDatabase, featureId: string): Promise<FeatureWithAsset> {
    const found = await this.repository.findById(db, featureId);

    if (!found) {
      throw new NotFoundError("Feature not found");
    }

    return found;
  }

  /** A custom feature of the campaign; global features and those of other campaigns are 404. */
  async requireCampaignFeature(
    db: AppDatabase,
    path: { campaignId: string; featureId: string },
  ): Promise<FeatureWithAsset> {
    const found = await this.requireFeature(db, path.featureId);

    if (found.feature.campaignId !== path.campaignId) {
      throw new NotFoundError("Feature not found");
    }

    return found;
  }

  /** A global feature; custom features are 404 here. */
  async requireSystemFeature(db: AppDatabase, featureId: string): Promise<FeatureWithAsset> {
    const found = await this.requireFeature(db, featureId);

    if (found.feature.campaignId !== null) {
      throw new NotFoundError("Feature not found");
    }

    return found;
  }

  /**
   * A feature of the campaign the viewer may read for this purpose (`ContentReadPurpose`): `MANAGE`
   * for the routes of the campaign's own features, `CATALOG` for what the campaign may use.
   */
  async requireReadableFeature(
    access: ContentAccess,
    featureId: string,
    purpose: ContentReadPurpose,
  ): Promise<FeatureWithAsset> {
    const found = await this.requireFeature(this.db, featureId);

    await access.require(purpose, found.asset, "Feature not found");

    return found;
  }

  async loadRecord(db: AppDatabase, found: FeatureWithAsset): Promise<FeatureRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as FeatureRecord;
  }

  async loadRecords(db: AppDatabase, items: readonly FeatureWithAsset[]): Promise<FeatureRecord[]> {
    const rulesetIds = await this.assets.repository.listRulesetIds(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  /**
   * Which referenced assets of these features the viewer may read; used to strip hidden references
   * from the player view.
   */
  async playerReferenceVisibility(
    db: AppDatabase,
    items: readonly FeatureWithAsset[],
    access: ContentAccess,
  ): Promise<(assetId: string) => boolean> {
    const ids = items.flatMap(({ feature }) =>
      collectAssetReferences(parseFeatureGraph(feature)).map((reference) => reference.assetId),
    );
    const readable = await access.readableIds("READ", [...(await this.assets.findMany(ids, db)).values()], db);

    return (assetId) => readable.has(assetId);
  }

  /** Outside a campaign, references are visible if they point to active global assets. */
  async globalReferenceVisibility(
    db: AppDatabase,
    items: readonly FeatureWithAsset[],
  ): Promise<(assetId: string) => boolean> {
    const ids = items.flatMap(({ feature }) =>
      collectAssetReferences(parseFeatureGraph(feature)).map((reference) => reference.assetId),
    );
    const referenced = await this.assets.findMany(ids, db);

    return (assetId) => {
      const asset = referenced.get(assetId);

      return asset?.scope === "SYSTEM" && asset.status === "ACTIVE";
    };
  }

  /**
   * Parameters of the features behind these assets, for source modules that bind them. Assets
   * without an active feature row are missing from the result.
   */
  async listParameters(
    db: AppDatabase,
    assetIds: readonly string[],
  ): Promise<Map<string, FeatureGraph["parameters"]>> {
    const found = await this.repository.findByAssetIds(db, assetIds);

    return new Map(
      [...found].map(([assetId, { feature }]) => [assetId, parseFeatureGraph(feature).parameters]),
    );
  }

  /**
   * What source modules need to know about features they grant, from one query that parses each
   * graph once: the parameters, whether the effects raise an ability score (`raisesAbilityScore`)
   * and whether the definition depends on a class level (`usesClassLevel`). A stored graph that no
   * longer parses is reported as invalid instead of failing the caller. With `lock: true` the
   * features stay locked (shared) until the transaction ends, so a concurrent change or archive
   * waits instead of slipping past the caller's checks. Missing ids are missing from the result.
   */
  async inspectFeatures(
    db: AppDatabase,
    assetIds: readonly string[],
    options: { lock?: boolean } = {},
  ): Promise<Map<string, FeatureInspection>> {
    const found = await this.repository.findByAssetIds(
      db,
      assetIds,
      options.lock ? { lock: "share" } : {},
    );
    const result = new Map<string, FeatureInspection>();

    for (const [assetId, { feature }] of found) {
      let graph: FeatureGraph;

      try {
        graph = parseFeatureGraph(feature);
      } catch {
        result.set(assetId, { valid: false });
        continue;
      }

      result.set(assetId, {
        valid: true,
        parameters: graph.parameters,
        raisesAbilityScore: raisesAbilityScore(graph),
        usesClassLevel: usesClassLevel(graph),
      });
    }

    return result;
  }

  /**
   * Lets another module refuse a change of a feature definition, for rules it keeps about the
   * features it uses (for example species of 2024 rulesets, which may not grant ability score
   * increases). Runs in the history guard, so on direct changes, undoing and restoring alike, with
   * the transaction of the change. Throws to reject.
   */
  registerChangeGuard(guard: FeatureChangeGuard): void {
    this.changeGuards.push(guard);
  }

  /** Edit routes for asset-links, for all custom features of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, { feature }]) => feature.campaignId === input.campaignId)
        .map(([assetId, { feature }]) => [
          assetId,
          `/campaigns/${input.campaignId}/features/${feature.id}`,
        ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global features are changed by administrators only; custom features by GMs, editors and
   * administrators of the campaign. Non-members get 404.
   */
  async assertCanWrite(
    context: RequestContext,
    campaignId: string | null,
    db: AppDatabase,
  ): Promise<string> {
    return this.assets.assertCanWrite(context, "EDIT", campaignId, db);
  }

  /** Id of the acting user, after `assertCanWrite` checked the rights. */
  actorIdOf(context: RequestContext): string {
    return this.assets.assertAuthenticated(context);
  }

  /** The feature of a write route: a custom one of the campaign, or a global one without it. */
  async requireForWrite(
    db: AppDatabase,
    path: { campaignId: string | null; featureId: string },
  ): Promise<FeatureWithAsset> {
    return path.campaignId === null
      ? this.requireSystemFeature(db, path.featureId)
      : this.requireCampaignFeature(db, { campaignId: path.campaignId, featureId: path.featureId });
  }

  /** Asset and feature in the transaction of the action; any failure undoes both. */
  async createFeature(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateFeatureDto,
  ): Promise<FeatureRecord> {
    const code = input.code ?? slugify(input.name, { fallback: "feature" }).slice(0, 100).replace(/-+$/, "");
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "FEATURE",
        title: input.name,
        // Codes are unique per scope, names may repeat.
        slug: slugify(input.name, { unique: true, fallback: "feature" }),
        summary: input.summary ?? null,
        status: input.status,
        releasedToPlayers: input.releasedToPlayers,
        rulesetPolicy: input.rulesetPolicy,
        ...(input.rulesetIds !== undefined ? { rulesetIds: input.rulesetIds } : {}),
        ...(input.assetFamilyId !== undefined ? { assetFamilyId: input.assetFamilyId } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      },
    );
    const graph: FeatureGraph = {
      sections: input.sections,
      parameters: input.parameters,
      choices: input.choices,
      resources: input.resources,
      scalingTracks: input.scalingTracks,
      activations: input.activations,
      effects: input.effects,
      supersedes: input.supersedes,
    };

    const feature = await this.withConstraintErrors(() =>
      scope.create(this.trackedFeature, {
        campaignId: params.campaignId,
        assetId: asset.id,
        code,
        featureType: input.featureType,
        description: input.description ?? null,
        stackingMode: input.stackingMode,
        ...graph,
      }),
    );

    return this.loadRecord(scope.tx, await this.requireFeature(scope.tx, feature.id));
  }

  /**
   * Asset fields first, then the feature. `merged` names the fields of both that kept a newer value
   * from somebody else. References are checked at the end of the action (`verifyContent`).
   */
  async updateFeature(
    scope: ActionScope,
    params: { found: FeatureWithAsset; actorId: string; command: UpdateFeatureDto },
  ): Promise<{ record: FeatureRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command;
    const { feature, asset } = params.found;
    const merged: string[] = [];

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived features cannot be modified", { assetId: asset.id });
    }

    const assetPatch = Object.fromEntries(
      ASSET_FIELDS.filter((key) => fields[key] !== undefined).map((key) => [
        key === "name" ? "title" : key,
        fields[key],
      ]),
    );

    if (Object.keys(assetPatch).length > 0) {
      const result = await this.assets.updateMetadata(scope, {
        assetId: asset.id,
        expectedVersion: expectedAssetVersion,
        actorId: params.actorId,
        patch: assetPatch,
      });

      merged.push(...result.merged.map((field) => ASSET_FIELD_NAMES[field] ?? field));
    }

    const set = Object.fromEntries(
      Object.entries(fields).filter(
        ([key, value]) =>
          value !== undefined && !(ASSET_FIELDS as readonly string[]).includes(key),
      ),
    );

    if (Object.keys(set).length > 0) {
      const result = await this.withConstraintErrors(() =>
        scope.change(this.trackedFeature, feature.id, async (current) => ({
          set: await this.withBaseGraph(scope, current, set, expectedVersion),
          baseVersion: expectedVersion,
        })),
      );

            merged.push(...result.merged);
    }

    const found = await this.requireFeature(scope.tx, feature.id);

    return { record: await this.loadRecord(scope.tx, found), merged };
  }

  /**
   * The history compares only the fields that were sent. A client that changes one rule part sends
   * the others unchanged in its mind, so they are added with their value at its base version: when
   * somebody else changed one of them in the meantime, the group makes that a conflict instead of
   * a mix of two versions.
   */
  private async withBaseGraph(
    scope: ActionScope,
    current: FeatureRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const parts: readonly string[] = FEATURE_GRAPH_PARTS;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => parts.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of FEATURE_GRAPH_PARTS) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedFeature, current.id, part, baseVersion);

        if (stored.known) {
          completed[part] = stored.value;
        }
      }
    }

    return completed;
  }

  /** Archives the asset; fails while other definitions still refer to it. */
  async archiveFeature(
    scope: ActionScope,
    params: { found: FeatureWithAsset; expectedAssetVersion: number },
  ): Promise<FeatureRecord> {
    await this.assets.archiveBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireFeature(scope.tx, params.found.feature.id));
  }

  async restoreFeature(
    scope: ActionScope,
    params: { found: FeatureWithAsset; expectedAssetVersion: number },
  ): Promise<FeatureRecord> {
    await this.assets.restoreBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireFeature(scope.tx, params.found.feature.id));
  }

  /**
   * The content check of a feature at the end of every action that touched it (see
   * `ContentTypeDefinition.verify`): its references, and the rules of the modules that grant it
   * (`registerChangeGuard`), on the state the action leaves behind.
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return;
    }

    const graph = parseFeatureGraph(found.feature);

    await this.assertReferencesValid(db, found.feature, graph);

    for (const guard of this.changeGuards) {
      await guard({ assetId: asset.id, campaignId: found.feature.campaignId, graph }, db);
    }
  }


  // ---------------------------------------------------------------------------
  // Rules that need the database
  // ---------------------------------------------------------------------------

  /**
   * Checks the assets a definition refers to. Missing assets and assets of other campaigns are
   * 404; unavailable, incompatible or cyclic ones 409, with all issues.
   */
  async assertReferencesValid(
    db: AppDatabase,
    row: Pick<FeatureRow, "assetId" | "campaignId">,
    graph: FeatureGraph,
  ): Promise<void> {
    const { missing, issues } = await this.collectReferenceIssues(db, row, graph);

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError("Feature definition refers to unavailable assets", { issues });
    }
  }

  /** Every issue of a stored definition, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, found: FeatureWithAsset): Promise<DefinitionIssue[]> {
    let graph: FeatureGraph;

    try {
      graph = parseFeatureGraph(found.feature);
    } catch (error) {
      if (error instanceof ValidationError) {
        const details = (error as ValidationError & { details?: unknown }).details;

        return Array.isArray(details)
          ? details.map((issue: { path?: (string | number)[]; message?: string }) => ({
              path: (issue.path ?? []).map((segment) =>
                typeof segment === "number" ? segment : String(segment),
              ),
              message: issue.message ?? "Invalid",
            }))
          : [{ path: [], message: error.message }];
      }

      throw error;
    }

    const issues: DefinitionIssue[] = [];

    if (found.asset.status === "ARCHIVED") {
      issues.push({ path: ["status"], message: "The feature is archived" });
    }

    const result = await this.collectReferenceIssues(db, found.feature, graph);

    return [...issues, ...result.missing, ...result.issues];
  }

  private async collectReferenceIssues(
    db: AppDatabase,
    row: Pick<FeatureRow, "assetId" | "campaignId">,
    graph: FeatureGraph,
  ): Promise<{ missing: DefinitionIssue[]; issues: DefinitionIssue[] }> {
    const references = collectAssetReferences(graph);
    const missing: DefinitionIssue[] = [];
    const issues: DefinitionIssue[] = [];

    if (references.length === 0) {
      return { missing, issues };
    }

    const referenced = await this.assets.findMany(
      references.map((reference) => reference.assetId),
      db,
    );
    const rulesetId =
      row.campaignId === null ? null : await this.campaignAccess.findRulesetId(row.campaignId, db);
    const ownRulesets =
      row.campaignId === null
        ? await this.ownRulesets(db, row.assetId)
        : null;

    for (const reference of references) {
      const target = referenced.get(reference.assetId);

      if (!target || (target.campaignId !== null && target.campaignId !== row.campaignId)) {
        missing.push({ path: reference.path, message: "Asset not found" });
        continue;
      }

      if (reference.kind === "SUPERSEDES") {
        if (target.assetType !== "FEATURE") {
          issues.push({ path: reference.path, message: "Only features can be superseded" });
          continue;
        }

        if (target.id === row.assetId) {
          issues.push({ path: reference.path, message: "A feature cannot supersede itself" });
          continue;
        }
      }

      if (target.status === "ARCHIVED") {
        issues.push({ path: reference.path, message: "The asset is archived" });
        continue;
      }

      if (row.campaignId === null) {
        // Global definitions may only rely on global content valid wherever they are valid.
        if (target.scope !== "SYSTEM" || target.status !== "ACTIVE") {
          issues.push({ path: reference.path, message: "Global features can only refer to active global assets" });
          continue;
        }

        if (!(await this.coversRulesets(db, target, ownRulesets))) {
          issues.push({ path: reference.path, message: "The asset is not available for the rulesets of the feature" });
        }

        continue;
      }

      if (target.scope === "SYSTEM" && target.status !== "ACTIVE") {
        missing.push({ path: reference.path, message: "Asset not found" });
        continue;
      }

      if (rulesetId && !(await this.assets.repository.isCompatible(db, target.id, rulesetId))) {
        issues.push({ path: reference.path, message: "The asset is not available for the campaign ruleset" });
      }
    }

    const targets = graph.supersedes.map((item) => item.targetAssetId);

    if (issues.length === 0 && missing.length === 0 && (await this.reaches(db, targets, row.assetId))) {
      issues.push({ path: ["supersedes"], message: "Superseding would form a cycle" });
    }

    return { missing, issues };
  }

  /** Rulesets of the feature's own asset; null for a neutral asset. */
  private async ownRulesets(db: AppDatabase, assetId: string): Promise<string[] | null> {
    const asset = await this.assets.requireAsset(db, assetId);

    if (asset.rulesetPolicy === "NEUTRAL") {
      return null;
    }

    return (await this.assets.repository.listRulesetIds(db, [assetId])).get(assetId) ?? [];
  }

  /** A neutral target fits everything; a restricted one must cover every ruleset of the feature. */
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
      (await this.assets.repository.listRulesetIds(db, [target.id])).get(target.id) ?? [],
    );

    return rulesets.every((rulesetId) => targetRulesets.has(rulesetId));
  }

  /** Whether following supersede targets from `start` leads back to `assetId`. */
  private async reaches(db: AppDatabase, start: readonly string[], assetId: string): Promise<boolean> {
    const seen = new Set<string>();
    let frontier = [...new Set(start)];

    while (frontier.length > 0 && seen.size < MAX_SUPERSEDE_CHAIN) {
      if (frontier.includes(assetId)) {
        return true;
      }

      frontier.forEach((id) => seen.add(id));

      const found = await this.repository.findByAssetIds(db, frontier);
      const next = new Set<string>();

      for (const { feature } of found.values()) {
        for (const item of feature.supersedes as { targetAssetId: string }[]) {
          if (!seen.has(item.targetAssetId)) {
            next.add(item.targetAssetId);
          }
        }
      }

      frontier = [...next];
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Resolving
  // ---------------------------------------------------------------------------

  /**
   * Binds parameters, choices and scaling for one actor. Assets chosen through a filter must be of
   * an allowed type and available in the campaign; players may only choose what they can see.
   * Results are cached by feature version, ruleset, bindings and actor. Callers inside a
   * transaction pass its handle as `db`.
   */
  async resolveFeature(
    found: FeatureWithAsset,
    input: {
      access: ContentAccess;
      bindings: FeatureBindings;
      actor: ActorSnapshot;
      db?: AppDatabase | undefined;
    },
  ): Promise<ResolvedFeatureGraph> {
    const graph = parseFeatureGraph(found.feature);
    const allowedSelections = await this.checkAssetSelections(graph, input);
    const key = FeatureResolutionCache.keyOf({
      featureId: found.feature.id,
      assetId: found.asset.id,
      version: found.feature.version,
      assetVersion: found.asset.version,
      rulesetId: input.access.viewer.rulesetId,
      bindings: input.bindings,
      actor: input.actor,
      // What a viewer may choose differs, e.g. between GM and player, so it is part of the key.
      allowedSelections: [...allowedSelections].sort(),
    });
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    let resolved: ResolvedFeatureGraph;

    try {
      resolved = resolveFeatureGraph(graph, input.bindings, input.actor, allowedSelections);
    } catch (error) {
      if (error instanceof FeatureBindingError) {
        throw new ValidationError(error.message, error.issues);
      }

      throw error;
    }

    this.cache.set(key, [found.feature.id, found.asset.id], resolved);

    return resolved;
  }

  /** Several features of one actor, combined; for source modules. Pure apart from the lookups. */
  evaluateEffects(
    instances: readonly {
      found: FeatureWithAsset;
      resolved: ResolvedFeatureGraph;
    }[],
  ): EvaluatedEffects {
    return evaluateFeatureEffects(
      instances.map(({ found, resolved }) => ({
        assetId: found.asset.id,
        stackingMode: found.feature.stackingMode,
        supersedes: parseFeatureGraph(found.feature).supersedes,
        resolved,
      })),
    );
  }

  /** Drops cached results after a change of a feature or its asset. */
  onHistoryEvent(event: HistoryEvent): void {
    if (event.entityType === FEATURE_ENTITY_TYPE || event.entityType === "asset") {
      this.cache.invalidate(event.entityId);
    }
  }

  private async checkAssetSelections(
    graph: FeatureGraph,
    input: {
      access: ContentAccess;
      bindings: FeatureBindings;
      db?: AppDatabase | undefined;
    },
  ): Promise<Set<string>> {
    const db = input.db ?? this.db;
    const candidates = new Map<string, Set<string>>();

    for (const choice of graph.choices) {
      if (!choice.optionFilter) {
        continue;
      }

      const codes = new Set(choice.options.map((option) => option.code));

      for (const entry of input.bindings.choices?.[choice.key] ?? []) {
        if (!codes.has(entry)) {
          const types = candidates.get(entry) ?? new Set<string>();

          choice.optionFilter.assetTypes.forEach((type) => types.add(type));
          candidates.set(entry, types);
        }
      }
    }

    // Entries are option codes or asset ids; free text is no asset and must not reach the uuid column.
    const entries = [...candidates.keys()].filter((entry) => UUID_PATTERN.test(entry));
    const assets = await this.assets.findMany(entries, db);
    // Newly chosen: active, of an allowed type and in what the campaign may use.
    const eligible = [...assets.values()].filter(
      (asset) => candidates.get(asset.id)?.has(asset.assetType) === true && asset.status === "ACTIVE",
    );

    return input.access.readableIds("CATALOG", eligible, db);
  }

  // ---------------------------------------------------------------------------
  // Usages
  // ---------------------------------------------------------------------------

  /** Features whose definitions refer to the asset, as typed usages for asset-links. */
  async listUsages(
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
    db: AppDatabase,
  ): Promise<AssetUsageItemDto[]> {
    const rows = await this.repository.listReferencing(db, input);

    return rows.map((row) => ({
      id: row.featureId,
      type: `FEATURE_${row.kinds[0] ?? "REFERENCE"}`,
      label: row.asset.title,
      assetId: row.asset.id,
      assetType: "FEATURE",
      editRoute:
        row.campaignId === null
          ? `/features/${row.featureId}`
          : `/campaigns/${row.campaignId}/features/${row.featureId}`,
    }));
  }

  async getUsages(access: ContentAccess, assetId: string) {
    return this.links.getUsages(access, assetId);
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("Feature code is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The feature violates a database constraint");
      }

      throw error;
    }
  }
}
