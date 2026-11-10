import type { ContentReadPurpose } from "#core/content/access";
import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import { UUID_PATTERN } from "#core/uuid";
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
  type ContentReference,
  slugify,
} from "#src/modules/assets/index";
import {
  BACKGROUND_2024_EDITION_YEAR,
  collectRuleReferences,
  type DefinitionIssue,
  referencedAssetIds,
  type RuleReference,
  toPlayerDefinition,
  validateBackgroundEdition,
} from "#src/modules/backgrounds/domain/BackgroundDefinition";
import type {
  BackgroundDefinition,
  BackgroundFeatureGrant,
} from "#src/modules/backgrounds/domain/dto/BackgroundDefinitionDto";
import type { CreateBackgroundDto } from "#src/modules/backgrounds/domain/dto/CreateBackgroundDto";
import type { UpdateBackgroundDto } from "#src/modules/backgrounds/domain/dto/UpdateBackgroundDto";
import type {
  BackgroundRecord,
  BackgroundRow,
  BackgroundsRepository,
  BackgroundWithAsset,
} from "#src/modules/backgrounds/domain/repository/BackgroundsRepository";
import {
  BACKGROUND_DEFINITION_GROUP,
  createTrackedBackground,
  parseBackgroundDefinition,
  type TrackedBackground,
  tryParseBackgroundDefinition,
} from "#src/modules/backgrounds/history/TrackedBackground";
import type { FeatsService } from "#src/modules/feats/index";
import { checkTypedValue, FEATURE_PROPERTIES, type FeaturesService } from "#src/modules/features/index";
import type { ItemsService } from "#src/modules/items/index";

/** Campaign and ruleset facts the module needs; provided by the campaigns and ruleset modules. */
export type BackgroundCampaignAccessPort = {
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

/** Fields of the asset that backgrounds show as their own. */
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

type BackgroundOwner = Pick<BackgroundRow, "assetId" | "campaignId">;

/**
 * Background definitions: global ones, maintained by administrators per ruleset and usable by every
 * campaign of a fitting ruleset, and custom ones of a campaign. Each background is an asset of type
 * `BACKGROUND`; the asset holds name, summary, status and rulesets, the background row the
 * definition. The character modules read backgrounds through this service
 * (`requireSelectableBackground`) and the selection service, and store the assignment themselves.
 */
export class BackgroundsService {
  public readonly trackedBackground: TrackedBackground;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: BackgroundsRepository,
    public readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    public readonly features: FeaturesService,
    public readonly feats: FeatsService,
    public readonly items: ItemsService,
    private readonly campaignAccess: BackgroundCampaignAccessPort,
  ) {
    this.trackedBackground = createTrackedBackground({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (row, tx) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived backgrounds cannot be modified", { assetId: asset.id });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireBackground(db: AppDatabase, backgroundId: string): Promise<BackgroundWithAsset> {
    const found = await this.repository.findById(db, backgroundId);

    if (!found) {
      throw new NotFoundError("Background not found");
    }

    return found;
  }

  /** A custom background of the campaign; global ones and those of other campaigns are 404. */
  async requireCampaignBackground(
    db: AppDatabase,
    path: { campaignId: string; backgroundId: string },
  ): Promise<BackgroundWithAsset> {
    const found = await this.requireBackground(db, path.backgroundId);

    if (found.background.campaignId !== path.campaignId) {
      throw new NotFoundError("Background not found");
    }

    return found;
  }

  /** A global background; custom ones are 404 here. */
  async requireSystemBackground(db: AppDatabase, backgroundId: string): Promise<BackgroundWithAsset> {
    const found = await this.requireBackground(db, backgroundId);

    if (found.background.campaignId !== null) {
      throw new NotFoundError("Background not found");
    }

    return found;
  }

  /** The background of a write route: a custom one of the campaign, or a global one without it. */
  async requireForWrite(
    db: AppDatabase,
    path: { campaignId: string | null; backgroundId: string },
  ): Promise<BackgroundWithAsset> {
    return path.campaignId === null
      ? this.requireSystemBackground(db, path.backgroundId)
      : this.requireCampaignBackground(db, { campaignId: path.campaignId, backgroundId: path.backgroundId });
  }

  /**
   * A background of the campaign the viewer may read for this purpose: `MANAGE` for the routes of
   * the campaign's own backgrounds, `CATALOG` for what the campaign may choose. Callers inside a
   * transaction pass its handle as `db`.
   */
  async requireReadableBackground(
    access: ContentAccess,
    backgroundId: string,
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<BackgroundWithAsset> {
    const found = await this.requireBackground(db, backgroundId);

    await access.require(purpose, found.asset, "Background not found", db);

    return found;
  }

  /**
   * A background that may be newly taken in the campaign, for the character modules: in the
   * catalog and active. One the viewer can read but that isn't active exists but can't be chosen
   * (409); one the viewer can't read is missing (404). Found by asset id, as assignments store it.
   */
  async requireSelectableBackground(
    access: ContentAccess,
    backgroundAssetId: string,
    db: AppDatabase = this.db,
  ): Promise<BackgroundWithAsset & { definition: BackgroundDefinition }> {
    const found = (await this.repository.findByAssetIds(db, [backgroundAssetId])).get(backgroundAssetId);

    if (!found) {
      throw new NotFoundError("Background not found");
    }

    // An inactive background the viewer can read exists but can't be chosen; one it can't read is
    // missing, like everything outside the catalog.
    if (found.asset.status !== "ACTIVE" && (await access.allows("READ", found.asset, db))) {
      throw new ConflictError("Only active backgrounds can be chosen", {
        backgroundAssetId,
        status: found.asset.status,
      });
    }

    await access.require("CATALOG", found.asset, "Background not found", db);

    if (found.asset.status !== "ACTIVE") {
      throw new NotFoundError("Background not found");
    }

    return { ...found, definition: parseBackgroundDefinition(found.background) };
  }

  async loadRecord(db: AppDatabase, found: BackgroundWithAsset): Promise<BackgroundRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as BackgroundRecord;
  }

  async loadRecords(db: AppDatabase, items: readonly BackgroundWithAsset[]): Promise<BackgroundRecord[]> {
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
    definition: BackgroundDefinition,
    access: ContentAccess | null,
  ): Promise<(assetId: string) => boolean> {
    return this.assets.referenceVisibility(access, referencedAssetIds(definition), db);
  }

  /** The definition as a player sees it (`toPlayerDefinition`); 409 if it no longer parses. */
  async playerDefinition(
    db: AppDatabase,
    definition: BackgroundDefinition,
    access: ContentAccess | null,
  ): Promise<{ definition: BackgroundDefinition; isVisible: (assetId: string) => boolean }> {
    const isVisible = await this.playerReferenceVisibility(db, definition, access);

    return { definition: toPlayerDefinition(definition, isVisible), isVisible };
  }

  /**
   * Custom features, feats and items a released background grants or offers. Players of the
   * campaign may see them through the background; global ones are visible anyway. Read without
   * parsing the definitions, so one stored definition that no longer parses cannot break it.
   */
  async listReleasedContentIds(input: { campaignId: string }, db: AppDatabase): Promise<string[]> {
    const ids = (await this.repository.listReleasedReferencedIds(db, input.campaignId)).filter((id) =>
      UUID_PATTERN.test(id),
    );
    const own = [...(await this.assets.findMany(ids, db)).values()].filter(
      (asset) => asset.campaignId === input.campaignId,
    );
    // A custom feat visible through the background shows what it grants and offers as well, as if
    // it were released itself.
    const featContent = await this.feats.listGrantedContentIds(
      db,
      own.filter((asset) => asset.assetType === "FEAT").map((asset) => asset.id),
    );
    const viaFeats = [...(await this.assets.findMany(featContent, db)).values()].filter(
      (asset) => asset.campaignId === input.campaignId,
    );

    return [...new Set([...own, ...viaFeats].map((asset) => asset.id))];
  }

  /** Edit routes for asset-links, for all custom backgrounds of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, item]) => item.background.campaignId === input.campaignId)
        .map(([assetId, item]) => [
          assetId,
          `${editRoutePrefix(input.campaignId)}/backgrounds/${item.background.id}`,
        ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global backgrounds are changed by administrators only; custom ones by GMs, editors and
   * administrators of the campaign. Non-members get 404.
   */
  async assertCanWrite(context: RequestContext, campaignId: string | null, db: AppDatabase): Promise<string> {
    return this.assets.assertCanWrite(context, "EDIT", campaignId, db);
  }

  /** Id of the acting user, after `assertCanWrite` checked the rights. */
  actorIdOf(context: RequestContext): string {
    return this.assets.assertAuthenticated(context);
  }

  /** Asset and background in the transaction of the action; any failure undoes both. */
  async createBackground(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateBackgroundDto,
  ): Promise<BackgroundRecord> {
    const code =
      input.code ?? slugify(input.name, { fallback: "background" }).slice(0, 100).replace(/-+$/, "");
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "BACKGROUND",
        title: input.name,
        // Codes are unique per scope and ruleset, names may repeat.
        slug: slugify(input.name, { unique: true, fallback: "background" }),
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
      customizationMode: input.customizationMode,
      displayOrder: input.displayOrder,
      sections: input.sections,
      abilityRule: input.abilityRule,
      proficiencyGrants: input.proficiencyGrants,
      featGrants: input.featGrants,
      featureGrants: input.featureGrants,
      equipmentOptions: input.equipmentOptions,
      promptTables: input.promptTables,
    };

    const created = await this.withConstraintErrors(() => scope.create(this.trackedBackground, row));

    return this.loadRecord(scope.tx, await this.requireBackground(scope.tx, created.id));
  }

  /**
   * Asset fields first, then the background. `merged` names the fields of both that kept a newer
   * value from somebody else. The rules are checked at the end of the action (`verifyContent`).
   */
  async updateBackground(
    scope: ActionScope,
    params: { found: BackgroundWithAsset; actorId: string; command: UpdateBackgroundDto },
  ): Promise<{ record: BackgroundRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command;
    const { background: row, asset } = params.found;
    const merged: string[] = [];

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived backgrounds cannot be modified", { assetId: asset.id });
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
        scope.change(this.trackedBackground, row.id, async (current) => ({
          set: await this.withBaseDefinition(scope, current, set, expectedVersion),
          baseVersion: expectedVersion,
        })),
      );

      merged.push(...result.merged);
    }

    const found = await this.requireBackground(scope.tx, row.id);

    return { record: await this.loadRecord(scope.tx, found), merged };
  }

  /**
   * The history compares only the fields that were sent. A client that changes one part sends the
   * others unchanged in its mind, so they are added with their value at its base version: when
   * somebody else changed one of them in the meantime, the group makes that a conflict (412)
   * instead of a mix of two versions. Like `FeatsService`.
   */
  private async withBaseDefinition(
    scope: ActionScope,
    current: BackgroundRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const group: readonly string[] = BACKGROUND_DEFINITION_GROUP;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => group.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of BACKGROUND_DEFINITION_GROUP) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedBackground, current.id, part, baseVersion);

        if (stored.known) {
          completed[part] = stored.value;
        }
      }
    }

    return completed;
  }

  /** Archives the asset; fails while other content still refers to it. */
  async archiveBackground(
    scope: ActionScope,
    params: { found: BackgroundWithAsset; expectedAssetVersion: number },
  ): Promise<BackgroundRecord> {
    await this.assets.archiveBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireBackground(scope.tx, params.found.background.id));
  }

  async restoreBackground(
    scope: ActionScope,
    params: { found: BackgroundWithAsset; expectedAssetVersion: number },
  ): Promise<BackgroundRecord> {
    await this.assets.restoreBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireBackground(scope.tx, params.found.background.id));
  }

  // ---------------------------------------------------------------------------
  // Content kernel
  // ---------------------------------------------------------------------------

  /**
   * What a stored background refers to, for the reference index: tool items, feats, granted and
   * targeted features, equipment items and bound asset ids, each with what its target must not be
   * (`collectRuleReferences`). Nothing if the definition no longer parses.
   */
  async listContentReferences(asset: AssetRow, db: AppDatabase): Promise<ContentReference[] | null> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return [];
    }

    const definition = tryParseBackgroundDefinition(found.background);

    if (definition === null) {
      // Unknown for now; the stored references stay.
      return null;
    }

    const { uses2024 } = await this.editionsOf(db, found.background);
    const bound = await this.features.collectBoundAssetReferences(
      db,
      definition.featureGrants.map((grant, grantIndex) => ({ ...grant, path: ["featureGrants", grantIndex] })),
    );

    return [
      ...collectRuleReferences(definition, uses2024).map((reference) => ({
        assetId: reference.assetId,
        path: reference.path,
        kind: "DEFINITION",
        forbids: reference.forbids,
      })),
      ...bound.map((reference) => ({ ...reference, kind: "DEFINITION" })),
    ];
  }

  /**
   * The content check of a background at the end of every action that touched it (see
   * `ContentTypeDefinition.verify`), on the state the action leaves behind: creating, changing
   * rulesets, undoing and restoring all count. Throws the first failing category.
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return;
    }

    const row = found.background;
    const definition = parseBackgroundDefinition(row);

    await this.assertSystemCodeFree(db, row);

    const { missing, issues } = await this.collectDefinitionIssues(db, row, definition);

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError("Background definition does not fit its rulesets or referenced assets", {
        issues,
      });
    }
  }

  /** Every issue of a stored background, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, found: BackgroundWithAsset): Promise<DefinitionIssue[]> {
    let definition: BackgroundDefinition;

    try {
      definition = parseBackgroundDefinition(found.background);
    } catch (error) {
      return issuesOf(error);
    }

    const issues: DefinitionIssue[] = [];

    if (found.asset.status === "ARCHIVED") {
      issues.push({ path: ["status"], message: "The background is archived" });
    }

    try {
      await this.assertSystemCodeFree(db, found.background, { lock: false });
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      issues.push({ path: ["code"], message: error.message });
    }

    const references = await this.collectDefinitionIssues(db, found.background, definition, { lock: false });

    return [...issues, ...references.missing, ...references.issues];
  }

  // ---------------------------------------------------------------------------
  // Rules that need the database
  // ---------------------------------------------------------------------------

  /**
   * The edition years the background is used with: the campaign ruleset for a custom background,
   * its rulesets for a global one; null for a neutral global background (every edition).
   */
  async editionsOf(
    db: AppDatabase,
    owner: BackgroundOwner,
  ): Promise<{ editions: number[] | null; campaignRulesetId: string | null; uses2024: boolean }> {
    let rulesetIds: readonly string[];
    let campaignRulesetId: string | null = null;

    if (owner.campaignId !== null) {
      campaignRulesetId = await this.campaignAccess.findRulesetId(owner.campaignId, db);
      rulesetIds = campaignRulesetId ? [campaignRulesetId] : [];
    } else {
      const own = await this.assets.ownRulesets(db, owner.assetId);

      if (own === null) {
        return { editions: null, campaignRulesetId, uses2024: true };
      }

      rulesetIds = own;
    }

    const years = await this.campaignAccess.findEditionYears(rulesetIds, db);
    const editions = rulesetIds.flatMap((id) => (years.has(id) ? [years.get(id) as number] : []));

    return {
      editions,
      campaignRulesetId,
      uses2024: editions.some((year) => year >= BACKGROUND_2024_EDITION_YEAR),
    };
  }

  /**
   * Global backgrounds share codes across rulesets (2014 and 2024 Acolyte), but two active global
   * backgrounds with the same code must not both be available for one ruleset; a neutral one is
   * available for all of them. Custom backgrounds are kept unique per campaign by an index.
   */
  async assertSystemCodeFree(
    db: AppDatabase,
    row: Pick<BackgroundRow, "id" | "assetId" | "campaignId" | "code">,
    options: { lock: boolean } = { lock: true },
  ): Promise<void> {
    if (row.campaignId !== null) {
      return;
    }

    if (options.lock) {
      await this.repository.lockSystemCode(db, row.code);
    }

    const others = (
      await this.repository.listSystemByCode(db, { code: row.code, exceptBackgroundId: row.id })
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
      const overlaps = own === null || theirs === null || own.some((rulesetId) => theirs.includes(rulesetId));

      if (overlaps) {
        throw new ConflictError("Background code is already used for one of these rulesets", {
          code: row.code,
          assetId: asset.id,
        });
      }
    }
  }

  /**
   * Issues of the edition rules, the referenced assets and the bindings of granted features.
   * Missing assets and assets of other campaigns are 404 (`missing`); everything else is 409
   * (`issues`): wrong types, archived or incompatible assets, targets that are what the place
   * forbids (no tool, wrong feat category, a feature that depends on a class level …) and bindings
   * that don't fit the feature. With `lock` (writes) the referenced features, feats and items stay
   * share-locked until the transaction ends, so a concurrent change waits; `validate` passes false.
   */
  private async collectDefinitionIssues(
    db: AppDatabase,
    owner: Pick<BackgroundRow, "assetId" | "campaignId" | "customizationMode">,
    definition: BackgroundDefinition,
    options: { lock: boolean } = { lock: true },
  ): Promise<{ missing: DefinitionIssue[]; issues: DefinitionIssue[] }> {
    const { editions, campaignRulesetId, uses2024 } = await this.editionsOf(db, owner);
    const rules = collectRuleReferences(definition, uses2024);
    const references: AssetReference[] = [...rules];
    const ids = (type: "FEATURE" | "FEAT" | "ITEM") =>
      rules.filter((reference) => reference.assetTypes.includes(type)).map((reference) => reference.assetId);
    const features = await this.features.inspectFeatures(db, ids("FEATURE"), { lock: options.lock });
    const feats = await this.feats.inspectFeats(db, ids("FEAT"), { lock: options.lock });
    const items = await this.items.inspectItems(db, ids("ITEM"), { lock: options.lock });
    const ownIssues: DefinitionIssue[] = [
      ...validateBackgroundEdition({ customizationMode: owner.customizationMode, definition }, editions),
      ...this.collectForbiddenIssues(rules, (assetId) => {
        const feature = features.get(assetId);

        if (feature) {
          return feature.valid
            ? [
                ...(feature.raisesAbilityScore ? [FEATURE_PROPERTIES.raisesAbilityScore] : []),
                ...(feature.usesClassLevel ? [FEATURE_PROPERTIES.usesClassLevel] : []),
              ]
            : [];
        }

        return feats.get(assetId)?.properties ?? items.get(assetId)?.properties ?? [];
      }),
      ...this.collectBindingIssues(definition.featureGrants, features, references),
    ];
    const result = await this.assets.collectReferenceIssues(
      db,
      { assetId: owner.assetId, campaignId: owner.campaignId, campaignRulesetId },
      references,
    );

    return { missing: result.missing, issues: [...result.issues, ...ownIssues] };
  }

  /** Targets that have a property their place forbids. */
  private collectForbiddenIssues(
    rules: readonly RuleReference[],
    propertiesOf: (assetId: string) => readonly { code: string; phrase: string }[],
  ): DefinitionIssue[] {
    return rules.flatMap((reference) =>
      propertiesOf(reference.assetId)
        .filter((property) => reference.forbids.includes(property.code))
        .map((property) => ({
          path: reference.path,
          message: `Not allowed here: the asset ${property.phrase}`,
        })),
    );
  }

  /**
   * Bindings against the parameters of the granted features; bound asset ids are added to
   * `references` so they are checked like the others.
   */
  private collectBindingIssues(
    grants: readonly BackgroundFeatureGrant[],
    inspected: Awaited<ReturnType<FeaturesService["inspectFeatures"]>>,
    references: AssetReference[],
  ): DefinitionIssue[] {
    const issues: DefinitionIssue[] = [];

    grants.forEach((grant, grantIndex) => {
      const path = ["featureGrants", grantIndex];
      const feature = inspected.get(grant.featureAssetId);

      if (!feature) {
        // Not a feature (or no feature row); the reference check reports it.
        return;
      }

      if (!feature.valid) {
        issues.push({ path: [...path, "featureAssetId"], message: "The stored definition of the granted feature is invalid" });
        return;
      }

      const bound = new Set(grant.bindings.map((binding) => binding.parameterKey));

      for (const parameter of feature.parameters) {
        if (parameter.required && parameter.defaultValue === null && !bound.has(parameter.key)) {
          issues.push({ path: [...path, "bindings"], message: `Required parameter '${parameter.key}' is not bound` });
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

        if (binding.bindingSource === "STATIC") {
          checkTypedValue(parameter.valueType, binding.staticValue).forEach(report);

          if (parameter.valueType === "ASSET_REF" && typeof binding.staticValue === "string") {
            references.push({ assetId: binding.staticValue, path: [...bindingPath, "staticValue"], assetTypes: ASSET_TYPES });
          }
        } else if (parameter.valueType !== "INTEGER" && parameter.valueType !== "DECIMAL") {
          report(`A context value cannot fill a ${parameter.valueType} parameter`);
        }
      });
    });

    return issues;
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
        throw new ConflictError("Background code is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The background violates a database constraint");
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
