import type { ContentReadPurpose } from "#core/content/access";
import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { type AssetLinksService, editRoutePrefix } from "#src/modules/asset-links/index";
import {
  ASSET_TYPES,
  type AssetReference,
  type AssetRow,
  type AssetsService,
  type ContentAccess,
  type ContentProperty,
  type ContentReference,
  slugify,
} from "#src/modules/assets/index";
import { checkTypedValue, type FeaturesService } from "#src/modules/features/index";
import type { CreateFeatDto } from "#src/modules/feats/domain/dto/CreateFeatDto";
import type { FeatDefinition, FeatFeatureGrant } from "#src/modules/feats/domain/dto/FeatDefinitionDto";
import type { UpdateFeatDto } from "#src/modules/feats/domain/dto/UpdateFeatDto";
import {
  collectChoiceReferences,
  collectGrantReferences,
  collectPrerequisiteReferences,
  type DefinitionIssue,
  type FeatCategory,
  featCategoriesFor,
  FEAT_CATEGORY_EDITION_YEAR,
  prerequisiteFeatIds,
  referencedAssetIds,
  staticBindingValues,
} from "#src/modules/feats/domain/FeatDefinition";
import type {
  FeatRecord,
  FeatRow,
  FeatsRepository,
  FeatWithAsset,
} from "#src/modules/feats/domain/repository/FeatsRepository";
import {
  createTrackedFeat,
  FEAT_DEFINITION_GROUP,
  parseFeatDefinition,
  type TrackedFeat,
  tryParseFeatDefinition,
} from "#src/modules/feats/history/TrackedFeat";

/** Campaign and ruleset facts the module needs; provided by the campaigns and ruleset modules. */
export type FeatCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
  findRulesetId(campaignId: string, db: AppDatabase): Promise<string | null>;
  /** Edition years of the rulesets; unknown ids are missing. */
  findEditionYears(rulesetIds: readonly string[], db: AppDatabase): Promise<Map<string, number>>;
};

const ASSET_FIELD_NAMES: Record<string, string> = { title: "name" };

/** Fields of the asset that feats show as their own. */
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

/** How deep the cycle check follows feat prerequisites; far beyond any real chain. */
const PREREQUISITE_CHAIN_LIMIT = 500;

type FeatOwner = Pick<FeatRow, "assetId" | "campaignId">;

/**
 * Feat definitions: global ones, maintained by administrators per ruleset and usable by every
 * campaign of a fitting ruleset, and custom ones of a campaign. Each feat is an asset of type
 * `FEAT`; the asset holds name, summary, status and rulesets, the feat row the definition. The
 * character modules read feats through this service (`requireSelectableFeat`, the eligibility
 * check, the resolution of grants) and store which feats a character took themselves.
 */
export class FeatsService {
  public readonly trackedFeat: TrackedFeat;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: FeatsRepository,
    public readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    public readonly features: FeaturesService,
    private readonly campaignAccess: FeatCampaignAccessPort,
  ) {
    this.trackedFeat = createTrackedFeat({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (row, tx) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived feats cannot be modified", { assetId: asset.id });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireFeat(db: AppDatabase, featId: string): Promise<FeatWithAsset> {
    const found = await this.repository.findById(db, featId);

    if (!found) {
      throw new NotFoundError("Feat not found");
    }

    return found;
  }

  /** A custom feat of the campaign; global feats and those of other campaigns are 404. */
  async requireCampaignFeat(
    db: AppDatabase,
    path: { campaignId: string; featId: string },
  ): Promise<FeatWithAsset> {
    const found = await this.requireFeat(db, path.featId);

    if (found.feat.campaignId !== path.campaignId) {
      throw new NotFoundError("Feat not found");
    }

    return found;
  }

  /** A global feat; custom feats are 404 here. */
  async requireSystemFeat(db: AppDatabase, featId: string): Promise<FeatWithAsset> {
    const found = await this.requireFeat(db, featId);

    if (found.feat.campaignId !== null) {
      throw new NotFoundError("Feat not found");
    }

    return found;
  }

  /** The feat of a write route: a custom one of the campaign, or a global one without it. */
  async requireForWrite(
    db: AppDatabase,
    path: { campaignId: string | null; featId: string },
  ): Promise<FeatWithAsset> {
    return path.campaignId === null
      ? this.requireSystemFeat(db, path.featId)
      : this.requireCampaignFeat(db, { campaignId: path.campaignId, featId: path.featId });
  }

  /**
   * A feat of the campaign the viewer may read for this purpose (`ContentReadPurpose`): `MANAGE`
   * for the routes of the campaign's own feats, `CATALOG` for what the campaign may choose.
   * Archived feats stay in the catalog while the campaign still uses them. Callers inside a
   * transaction pass its handle as `db`.
   */
  async requireReadableFeat(
    access: ContentAccess,
    featId: string,
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<FeatWithAsset> {
    const found = await this.requireFeat(db, featId);

    await access.require(purpose, found.asset, "Feat not found", db);

    return found;
  }

  /**
   * A feat that may be newly taken in the campaign, for the character modules: in the catalog and
   * active. A feat the viewer can read but that isn't active exists but can't be chosen (409); one
   * the viewer can't read is missing (404).
   */
  async requireSelectableFeat(
    access: ContentAccess,
    featId: string,
    db: AppDatabase = this.db,
  ): Promise<FeatWithAsset & { definition: FeatDefinition }> {
    const found = await this.requireFeat(db, featId);

    if (found.asset.status !== "ACTIVE" && (await access.allows("READ", found.asset, db))) {
      throw new ConflictError("Only active feats can be chosen", {
        featId,
        status: found.asset.status,
      });
    }

    await access.require("CATALOG", found.asset, "Feat not found", db);

    if (found.asset.status !== "ACTIVE") {
      throw new ConflictError("Only active feats can be chosen", { featId, status: found.asset.status });
    }

    return { ...found, definition: parseFeatDefinition(found.feat) };
  }

  async loadRecord(db: AppDatabase, found: FeatWithAsset): Promise<FeatRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as FeatRecord;
  }

  async loadRecords(db: AppDatabase, items: readonly FeatWithAsset[]): Promise<FeatRecord[]> {
    const rulesetIds = await this.assets.repository.listRulesetIds(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  /**
   * Which assets the definition refers to the viewer may read; used to strip hidden references
   * from the player view. Without access (outside a campaign) only active global assets count.
   */
  async playerReferenceVisibility(
    db: AppDatabase,
    definition: FeatDefinition,
    access: ContentAccess | null,
  ): Promise<(assetId: string) => boolean> {
    return this.assets.referenceVisibility(access, referencedAssetIds(definition), db);
  }

  /**
   * Custom features a released feat grants, upgrades to or offers as options. Players of the
   * campaign may see them through the feat; global features are visible anyway. Read without
   * parsing the definitions, so one stored definition that no longer parses cannot break it.
   */
  async listReleasedFeatureIds(input: { campaignId: string }, db: AppDatabase): Promise<string[]> {
    const ids = await this.repository.listReleasedReferencedIds(db, input.campaignId);
    const found = await this.assets.findMany(ids, db);

    return [...found.values()]
      .filter((asset) => asset.assetType === "FEATURE" && asset.campaignId === input.campaignId)
      .map((asset) => asset.id);
  }

  /**
   * Categories of feats, for content that offers only some of them (a 2024 background grants an
   * origin feat). With `lock` the rows stay share-locked until the transaction ends, so a
   * concurrent category change waits.
   */
  async inspectFeats(
    db: AppDatabase,
    assetIds: readonly string[],
    options: { lock?: boolean } = {},
  ): Promise<Map<string, { category: FeatCategory; properties: ContentProperty[] }>> {
    const found = await this.repository.findByAssetIds(db, assetIds, options.lock ? { lock: "share" } : {});

    return new Map(
      [...found].map(([assetId, { feat }]) => [
        assetId,
        { category: feat.category, properties: [featCategoryProperty(feat.category)] },
      ]),
    );
  }

  /** What the feat is that referring content may forbid; see `featCategoryProperty`. */
  async listContentProperties(asset: AssetRow, db: AppDatabase): Promise<ContentProperty[]> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    return found ? [featCategoryProperty(found.feat.category)] : [];
  }

  /**
   * What these feats grant, upgrade, offer as options or bind, for content that makes the feats
   * visible to players without a release of their own (a released background granting a custom
   * feat). Feats whose stored definition no longer parses give nothing.
   */
  async listGrantedContentIds(db: AppDatabase, featAssetIds: readonly string[]): Promise<string[]> {
    const found = await this.repository.findByAssetIds(db, featAssetIds);

    return [...found.values()].flatMap(({ feat }) => {
      const definition = tryParseFeatDefinition(feat);

      return definition === null
        ? []
        : [
            ...collectGrantReferences(definition.featureGrants),
            ...collectChoiceReferences(definition.choices),
          ]
            .map((reference) => reference.assetId)
            .concat(staticBindingValues(definition.featureGrants));
    });
  }

  /** Edit routes for asset-links, for all custom feats of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, item]) => item.feat.campaignId === input.campaignId)
        .map(([assetId, item]) => [
          assetId,
          `${editRoutePrefix(input.campaignId)}/feats/${item.feat.id}`,
        ]),
    );
  }

  /** The categories feats of the campaign may have, by the edition of its ruleset. */
  async categoriesOf(
    campaignId: string,
    db: AppDatabase = this.db,
  ): Promise<{ rulesetId: string; editionYear: number | null; categories: readonly FeatCategory[] }> {
    const rulesetId = await this.campaignAccess.findRulesetId(campaignId, db);

    if (!rulesetId) {
      throw new NotFoundError("Campaign not found");
    }

    const editionYear = (await this.campaignAccess.findEditionYears([rulesetId], db)).get(rulesetId) ?? null;

    return { rulesetId, editionYear, categories: featCategoriesFor(editionYear ?? 0) };
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global feats are changed by administrators only; custom feats by GMs, editors and
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

  /** Asset and feat in the transaction of the action; any failure undoes both. */
  async createFeat(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateFeatDto,
  ): Promise<FeatRecord> {
    const code =
      input.code ?? slugify(input.name, { fallback: "feat" }).slice(0, 100).replace(/-+$/, "");
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "FEAT",
        title: input.name,
        // Codes are unique per scope and ruleset, names may repeat.
        slug: slugify(input.name, { unique: true, fallback: "feat" }),
        summary: input.summary ?? null,
        status: input.status,
        releasedToPlayers: input.releasedToPlayers,
        rulesetPolicy: input.rulesetPolicy,
        ...(input.rulesetIds !== undefined ? { rulesetIds: input.rulesetIds } : {}),
        ...(input.assetFamilyId !== undefined ? { assetFamilyId: input.assetFamilyId } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      },
    );
    const row = {
      campaignId: params.campaignId,
      assetId: asset.id,
      code,
      description: input.description ?? null,
      category: input.category,
      minimumCharacterLevel: input.minimumCharacterLevel,
      prerequisiteCheckMode: input.prerequisiteCheckMode,
      displayOrder: input.displayOrder,
      prerequisites: input.prerequisites,
      repeatability: input.repeatability,
      choices: input.choices,
      featureGrants: input.featureGrants,
    };

    const created = await this.withConstraintErrors(() => scope.create(this.trackedFeat, row));

    return this.loadRecord(scope.tx, await this.requireFeat(scope.tx, created.id));
  }

  /**
   * Asset fields first, then the feat. `merged` names the fields of both that kept a newer value
   * from somebody else. The rules are checked at the end of the action (`verifyContent`).
   */
  async updateFeat(
    scope: ActionScope,
    params: { found: FeatWithAsset; actorId: string; command: UpdateFeatDto },
  ): Promise<{ record: FeatRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command;
    const { feat: row, asset } = params.found;
    const merged: string[] = [];

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived feats cannot be modified", { assetId: asset.id });
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
        ([key, value]) => value !== undefined && !(ASSET_FIELDS as readonly string[]).includes(key),
      ),
    );

    if (Object.keys(set).length > 0) {
      const result = await this.withConstraintErrors(() =>
        scope.change(this.trackedFeat, row.id, async (current) => ({
          set: await this.withBaseDefinition(scope, current, set, expectedVersion),
          baseVersion: expectedVersion,
        })),
      );

      merged.push(...result.merged);
    }

    const found = await this.requireFeat(scope.tx, row.id);

    return { record: await this.loadRecord(scope.tx, found), merged };
  }

  /**
   * The history compares only the fields that were sent. A client that changes one part sends the
   * others unchanged in its mind, so they are added with their value at its base version: when
   * somebody else changed one of them in the meantime, the group makes that a conflict (412)
   * instead of a mix of two versions. Like `ClassesService`.
   */
  private async withBaseDefinition(
    scope: ActionScope,
    current: FeatRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const group: readonly string[] = FEAT_DEFINITION_GROUP;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => group.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of FEAT_DEFINITION_GROUP) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedFeat, current.id, part, baseVersion);

        if (stored.known) {
          completed[part] = stored.value;
        }
      }
    }

    return completed;
  }

  /** Archives the asset; fails while other content still refers to it. */
  async archiveFeat(
    scope: ActionScope,
    params: { found: FeatWithAsset; expectedAssetVersion: number },
  ): Promise<FeatRecord> {
    await this.assets.archiveBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireFeat(scope.tx, params.found.feat.id));
  }

  async restoreFeat(
    scope: ActionScope,
    params: { found: FeatWithAsset; expectedAssetVersion: number },
  ): Promise<FeatRecord> {
    await this.assets.restoreBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireFeat(scope.tx, params.found.feat.id));
  }

  // ---------------------------------------------------------------------------
  // Content kernel
  // ---------------------------------------------------------------------------

  /**
   * What a stored feat refers to, for the reference index: assets its prerequisites name
   * (`PREREQUISITE`), granted and targeted features, linked choice options and bound asset ids
   * (`DEFINITION`). Nothing if the definition no longer parses.
   */
  async listContentReferences(asset: AssetRow, db: AppDatabase): Promise<ContentReference[] | null> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return [];
    }

    const definition = tryParseFeatDefinition(found.feat);

    if (definition === null) {
      // Unknown for now; the stored references stay.
      return null;
    }

    const bound = await this.features.collectBoundAssetReferences(
      db,
      definition.featureGrants.map((grant, grantIndex) => ({
        ...grant,
        path: ["featureGrants", grantIndex],
      })),
    );

    return [
      ...collectPrerequisiteReferences(definition.prerequisites).map((reference) => ({
        assetId: reference.assetId,
        path: reference.path,
        kind: "PREREQUISITE",
      })),
      ...[
        ...collectGrantReferences(definition.featureGrants),
        ...collectChoiceReferences(definition.choices),
        ...bound,
      ].map((reference) => ({ assetId: reference.assetId, path: reference.path, kind: "DEFINITION" })),
    ];
  }

  /**
   * The content check of a feat at the end of every action that touched it (see
   * `ContentTypeDefinition.verify`), on the state the action leaves behind: creating, changing
   * rulesets, undoing and restoring all count. Throws the first failing category.
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return;
    }

    const row = found.feat;
    const definition = parseFeatDefinition(row);

    await this.assertSystemCodeFree(db, row);

    const category = await this.collectCategoryIssues(db, row);

    if (category.length > 0) {
      throw new ConflictError("The category does not fit the rulesets of the feat", { issues: category });
    }

    const { missing, issues } = await this.collectDefinitionIssues(db, row, definition);

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError("Feat definition refers to unavailable assets", { issues });
    }

    const cycle = await this.collectPrerequisiteCycleIssues(db, row, definition, { lock: true });

    if (cycle.length > 0) {
      throw new ConflictError("Feat prerequisites form a cycle", { issues: cycle });
    }
  }

  /** Every issue of a stored feat, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, found: FeatWithAsset): Promise<DefinitionIssue[]> {
    let definition: FeatDefinition;

    try {
      definition = parseFeatDefinition(found.feat);
    } catch (error) {
      return issuesOf(error);
    }

    const issues: DefinitionIssue[] = [];

    if (found.asset.status === "ARCHIVED") {
      issues.push({ path: ["status"], message: "The feat is archived" });
    }

    try {
      await this.assertSystemCodeFree(db, found.feat, { lock: false });
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      issues.push({ path: ["code"], message: error.message });
    }

    const references = await this.collectDefinitionIssues(db, found.feat, definition, { lock: false });

    return [
      ...issues,
      ...(await this.collectCategoryIssues(db, found.feat)),
      ...references.missing,
      ...references.issues,
      ...(await this.collectPrerequisiteCycleIssues(db, found.feat, definition, { lock: false })),
    ];
  }

  // ---------------------------------------------------------------------------
  // Rules that need the database
  // ---------------------------------------------------------------------------

  /**
   * Global feats share codes across rulesets (2014 and 2024 Alert), but two active global feats
   * with the same code must not both be available for one ruleset; a neutral feat is available for
   * all of them. Custom feats are kept unique per campaign by an index.
   */
  async assertSystemCodeFree(
    db: AppDatabase,
    row: Pick<FeatRow, "id" | "assetId" | "campaignId" | "code">,
    options: { lock: boolean } = { lock: true },
  ): Promise<void> {
    if (row.campaignId !== null) {
      return;
    }

    if (options.lock) {
      await this.repository.lockSystemCode(db, row.code);
    }

    const others = (
      await this.repository.listSystemByCode(db, { code: row.code, exceptFeatId: row.id })
    ).filter(({ asset }) => asset.status !== "ARCHIVED" && asset.id !== row.assetId);

    if (others.length === 0) {
      return;
    }

    const own = await this.assets.ownRulesets(db, row.assetId);
    const otherRulesets = await this.assets.repository.listRulesetIds(
      db,
      others.map(({ asset }) => asset.id),
    );

    for (const { asset } of others) {
      const theirs = asset.rulesetPolicy === "NEUTRAL" ? null : (otherRulesets.get(asset.id) ?? []);
      const overlaps =
        own === null || theirs === null || own.some((rulesetId) => theirs.includes(rulesetId));

      if (overlaps) {
        throw new ConflictError("Feat code is already used for one of these rulesets", {
          code: row.code,
          assetId: asset.id,
        });
      }
    }
  }

  /**
   * Categories other than `GENERAL` exist from the 2024 rules on, so such a feat must only be
   * available for rulesets of that edition: a custom feat through its campaign ruleset, a global
   * one through all of its rulesets. A neutral global feat is available for every ruleset and is
   * therefore `GENERAL`.
   */
  private async collectCategoryIssues(
    db: AppDatabase,
    row: Pick<FeatRow, "assetId" | "campaignId" | "category">,
  ): Promise<DefinitionIssue[]> {
    if (row.category === "GENERAL") {
      return [];
    }

    const message = `${row.category} feats exist from the ${FEAT_CATEGORY_EDITION_YEAR} rules on`;
    let rulesetIds: readonly string[];

    if (row.campaignId !== null) {
      const rulesetId = await this.campaignAccess.findRulesetId(row.campaignId, db);

      rulesetIds = rulesetId ? [rulesetId] : [];
    } else {
      const own = await this.assets.ownRulesets(db, row.assetId);

      if (own === null) {
        return [{ path: ["category"], message: `${message}; neutral feats are GENERAL` }];
      }

      rulesetIds = own;
    }

    const years = await this.campaignAccess.findEditionYears(rulesetIds, db);
    const older = rulesetIds.filter((id) => (years.get(id) ?? 0) < FEAT_CATEGORY_EDITION_YEAR);

    return older.length > 0 ? [{ path: ["category"], message }] : [];
  }

  /**
   * Issues of the referenced assets and of the bindings of granted features. Missing assets and
   * assets of other campaigns are 404 (`missing`); wrong types, the feat itself as a prerequisite,
   * archived or incompatible assets and bindings that don't fit the feature are 409 (`issues`).
   * With `lock` (writes) the granted features stay share-locked until the transaction ends, so a
   * concurrent change or archive of one of them waits; `validate` passes false.
   */
  private async collectDefinitionIssues(
    db: AppDatabase,
    owner: FeatOwner,
    definition: FeatDefinition,
    options: { lock: boolean } = { lock: true },
  ): Promise<{ missing: DefinitionIssue[]; issues: DefinitionIssue[] }> {
    const references: AssetReference[] = [
      ...collectPrerequisiteReferences(definition.prerequisites),
      ...collectGrantReferences(definition.featureGrants),
      ...collectChoiceReferences(definition.choices),
    ];
    const bindingIssues = await this.collectBindingIssues(db, definition, references, options);
    const campaignRulesetId =
      owner.campaignId === null ? null : await this.campaignAccess.findRulesetId(owner.campaignId, db);
    const result = await this.assets.collectReferenceIssues(
      db,
      { assetId: owner.assetId, campaignId: owner.campaignId, campaignRulesetId },
      references,
    );

    return {
      missing: result.missing,
      issues: [
        ...result.issues.map((issue) =>
          issue.message === "An asset cannot refer to itself"
            ? { ...issue, message: "A feat cannot be its own prerequisite" }
            : issue,
        ),
        ...bindingIssues,
      ],
    };
  }

  /**
   * Bindings against the parameters of the granted features; bound asset ids are added to
   * `references` so they are checked like the others.
   */
  private async collectBindingIssues(
    db: AppDatabase,
    definition: FeatDefinition,
    references: AssetReference[],
    options: { lock: boolean },
  ): Promise<DefinitionIssue[]> {
    const issues: DefinitionIssue[] = [];
    const grants: readonly FeatFeatureGrant[] = definition.featureGrants;
    const inspected = await this.features.inspectFeatures(
      db,
      grants.flatMap((grant) =>
        grant.targetFeatureAssetId === null
          ? [grant.featureAssetId]
          : [grant.featureAssetId, grant.targetFeatureAssetId],
      ),
      { lock: options.lock },
    );

    grants.forEach((grant, grantIndex) => {
      const path = ["featureGrants", grantIndex];
      const feature = inspected.get(grant.featureAssetId);

      if (!feature) {
        // Not a feature (or no feature row); the reference check reports it.
        return;
      }

      if (!feature.valid) {
        issues.push({
          path: [...path, "featureAssetId"],
          message: "The stored definition of the granted feature is invalid",
        });
        return;
      }

      const bound = new Set(grant.bindings.map((binding) => binding.parameterKey));

      for (const parameter of feature.parameters) {
        if (parameter.required && parameter.defaultValue === null && !bound.has(parameter.key)) {
          issues.push({
            path: [...path, "bindings"],
            message: `Required parameter '${parameter.key}' is not bound`,
          });
        }
      }

      grant.bindings.forEach((binding, bindingIndex) => {
        const bindingPath = [...path, "bindings", bindingIndex];
        const parameter = feature.parameters.find((item) => item.key === binding.parameterKey);
        const report = (message: string) => issues.push({ path: bindingPath, message });

        if (!parameter) {
          report(`The feature has no parameter '${binding.parameterKey}'`);
          return;
        }

        switch (binding.bindingSource) {
          case "STATIC":
            checkTypedValue(parameter.valueType, binding.staticValue).forEach(report);

            if (parameter.valueType === "ASSET_REF" && typeof binding.staticValue === "string") {
              references.push({
                assetId: binding.staticValue,
                path: [...bindingPath, "staticValue"],
                assetTypes: ASSET_TYPES,
              });
            }

            break;
          case "CONTEXT":
            if (parameter.valueType !== "INTEGER" && parameter.valueType !== "DECIMAL") {
              report(`A context value cannot fill a ${parameter.valueType} parameter`);
            }

            break;
          case "FEAT_CHOICE":
            if (parameter.valueType !== "TEXT" && parameter.valueType !== "ASSET_REF") {
              report(`A choice cannot fill a ${parameter.valueType} parameter`);
            }

            break;
        }
      });
    });

    return issues;
  }

  /**
   * Feats that require each other can never be taken. Follows the `FEAT` prerequisites of the
   * named feats (archived ones too, they may come back) and reports a chain that leads back to
   * this feat. With `lock` (writes) prerequisite changes of feats are serialized first, so two
   * actions cannot close a cycle at the same time.
   */
  private async collectPrerequisiteCycleIssues(
    db: AppDatabase,
    row: Pick<FeatRow, "assetId">,
    definition: FeatDefinition,
    options: { lock: boolean },
  ): Promise<DefinitionIssue[]> {
    let frontier = prerequisiteFeatIds(definition.prerequisites).filter((id) => id !== row.assetId);

    if (frontier.length === 0) {
      return [];
    }

    if (options.lock) {
      await this.repository.lockPrerequisiteGraph(db);
    }

    const seen = new Set<string>(frontier);

    while (frontier.length > 0 && seen.size < PREREQUISITE_CHAIN_LIMIT) {
      const found = await this.repository.findByAssetIds(db, frontier);
      const next: string[] = [];

      for (const { feat } of found.values()) {
        const parsed = tryParseFeatDefinition(feat);

        for (const id of prerequisiteFeatIds(parsed?.prerequisites ?? null)) {
          if (id === row.assetId) {
            return [
              {
                path: ["prerequisites"],
                message: "A feat named in the prerequisites requires this feat, directly or through others",
              },
            ];
          }

          if (!seen.has(id)) {
            seen.add(id);
            next.push(id);
          }
        }
      }

      frontier = next;
    }

    return [];
  }

  // ---------------------------------------------------------------------------
  // Usages
  // ---------------------------------------------------------------------------

  async getUsages(access: ContentAccess, assetId: string) {
    return this.links.getUsages(access, assetId);
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("Feat code is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The feat violates a database constraint");
      }

      throw error;
    }
  }
}

/** Issues carried by an error, or the error message as one issue. */
function issuesOf(error: unknown): DefinitionIssue[] {
  if (!(error instanceof ValidationError)) {
    throw error;
  }

  const details = (error as { details?: unknown }).details;

  if (!Array.isArray(details)) {
    return [{ path: [], message: error.message }];
  }

  return details.map((issue) => {
    const item = issue as { path?: (string | number | symbol)[]; message?: string };

    return {
      path: (item.path ?? []).map((segment) => (typeof segment === "number" ? segment : String(segment))),
      message: item.message ?? "Invalid",
    };
  });
}

/** Property of a feat of this category; referring content forbids the categories it doesn't offer. */
export function featCategoryProperty(category: FeatCategory): ContentProperty {
  return { code: `FEAT_CATEGORY_${category}`, phrase: `is a ${category} feat` };
}
