import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import type { AssetLinksService, AssetUsageItemDto } from "#src/modules/asset-links/index";
import {
  ASSET_TYPES,
  type AssetReference,
  type AssetRow,
  type AssetsService,
  type CampaignAssetViewer,
  slugify,
} from "#src/modules/assets/index";
import {
  checkTypedValue,
  type FeatureChangeGuard,
  type FeaturesService,
  raisesAbilityScore,
  usesClassLevel,
} from "#src/modules/features/index";
import type { CreateSpeciesDto } from "#src/modules/species/domain/dto/CreateSpeciesDto";
import type {
  SpeciesDefinition,
  SpeciesFeatureGrant,
} from "#src/modules/species/domain/dto/SpeciesDefinitionDto";
import type { UpdateSpeciesDto } from "#src/modules/species/domain/dto/UpdateSpeciesDto";
import {
  collectGrantReferences,
  type DefinitionIssue,
  type SiblingVariant,
  staticBindingValues,
  validateVariantDefinition,
} from "#src/modules/species/domain/SpeciesDefinition";
import type {
  SpeciesRecord,
  SpeciesRepository,
  SpeciesRow,
  SpeciesVariantRow,
  SpeciesVariantWithAsset,
  SpeciesWithAsset,
} from "#src/modules/species/domain/repository/SpeciesRepository";
import {
  createTrackedSpecies,
  createTrackedSpeciesVariant,
  parseSpeciesDefinition,
  SPECIES_DEFINITION_GROUP,
  parseVariantGrants,
  type TrackedSpecies,
  type TrackedSpeciesVariant,
  tryParseVariantGrants,
} from "#src/modules/species/history/TrackedSpecies";

/** Campaign and ruleset facts the module needs; provided by the campaigns and ruleset modules. */
export type SpeciesCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
  findRulesetId(campaignId: string, db: AppDatabase): Promise<string | null>;
  /** Rulesets of several campaigns in one query; unknown campaigns are missing. */
  findRulesetIds(campaignIds: readonly string[], db: AppDatabase): Promise<Map<string, string | null>>;
  /** Edition years of the rulesets; unknown ids are missing. */
  findEditionYears(rulesetIds: readonly string[], db: AppDatabase): Promise<Map<string, number>>;
};

/**
 * From this edition on, ability score increases come from the background, so species may not grant
 * them (2024 Player's Handbook). Older rulesets model them as feature grants.
 */
export const ABILITY_INCREASE_FREE_EDITION_YEAR = 2024;

const ASSET_FIELD_NAMES: Record<string, string> = { title: "name" };

const CLASS_LEVEL_MESSAGE =
  "Species grant features that scale by character level; this one depends on a class level";

/** Fields of the asset that species and variants show as their own. */
export const ASSET_FIELDS = [
  "releasedToPlayers",
  "name",
  "summary",
  "status",
  "sourceReference",
  "rulesetPolicy",
  "rulesetIds",
  "assetFamilyId",
] as const;

type GrantOwner = { assetId: string; campaignId: string | null };

/** A variant as the rules check it: stored or about to be written. */
type VariantCheckRow = Pick<
  SpeciesVariantRow,
  "assetId" | "campaignId" | "speciesId" | "variantGroupCode"
> & { featureGrants: SpeciesFeatureGrant[] };

/** What a viewer may see of the catalog; see `SpeciesService.isAvailableInCatalog`. */
export type CatalogAccess = {
  visibleAssetIds: ReadonlySet<string>;
  inUseAssetIds: ReadonlySet<string>;
  archived: "always" | "ifInUse";
};

/**
 * Species definitions: global ones, maintained by administrators per ruleset and usable by every
 * campaign of a fitting ruleset, and custom ones of a campaign. Each species is an asset of type
 * `SPECIES`, each of its variants one of type `SPECIES_VARIANT`; the assets hold name, summary,
 * status and rulesets, the rows the definitions. This service holds the species and the rules both
 * share; variants are written by `SpeciesVariantsService`. Character modules read species through
 * it and store what a character chose themselves.
 */
export class SpeciesService {
  public readonly trackedSpecies: TrackedSpecies;
  public readonly trackedVariant: TrackedSpeciesVariant;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: SpeciesRepository,
    public readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    public readonly features: FeaturesService,
    private readonly campaignAccess: SpeciesCampaignAccessPort,
  ) {
    const deps = {
      resolveRole: async (campaignId: string, actorId: string, tx: AppDatabase) => {
        const campaign = await campaignAccess.findCampaignRole(campaignId, actorId, tx);

        return campaign?.isOwner ? ("GM" as const) : (campaign?.role ?? null);
      },
      assertSpeciesConsistent: async (
        row: SpeciesRow & { definition: SpeciesDefinition },
        tx: AppDatabase,
      ) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived species cannot be modified", { assetId: asset.id });
        }

        await this.assertSpeciesValid(tx, row, row.definition);
      },
      assertVariantConsistent: async (
        row: SpeciesVariantRow & { featureGrants: SpeciesFeatureGrant[] },
        tx: AppDatabase,
      ) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived variants cannot be modified", { assetId: asset.id });
        }

        await this.assertVariantValid(tx, row);
      },
    };

    this.trackedSpecies = createTrackedSpecies(deps);
    this.trackedVariant = createTrackedSpeciesVariant(deps);
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireSpecies(db: AppDatabase, speciesId: string): Promise<SpeciesWithAsset> {
    const found = await this.repository.findById(db, speciesId);

    if (!found) {
      throw new NotFoundError("Species not found");
    }

    return found;
  }

  /** A custom species of the campaign; global species and those of other campaigns are 404. */
  async requireCampaignSpecies(
    db: AppDatabase,
    path: { campaignId: string; speciesId: string },
  ): Promise<SpeciesWithAsset> {
    const found = await this.requireSpecies(db, path.speciesId);

    if (found.species.campaignId !== path.campaignId) {
      throw new NotFoundError("Species not found");
    }

    return found;
  }

  /** A global species; custom species are 404 here. */
  async requireSystemSpecies(db: AppDatabase, speciesId: string): Promise<SpeciesWithAsset> {
    const found = await this.requireSpecies(db, speciesId);

    if (found.species.campaignId !== null) {
      throw new NotFoundError("Species not found");
    }

    return found;
  }

  /** The species of a write route: a custom one of the campaign, or a global one without it. */
  async requireForWrite(
    db: AppDatabase,
    path: { campaignId: string | null; speciesId: string },
  ): Promise<SpeciesWithAsset> {
    return path.campaignId === null
      ? this.requireSystemSpecies(db, path.speciesId)
      : this.requireCampaignSpecies(db, { campaignId: path.campaignId, speciesId: path.speciesId });
  }

  /**
   * Whether an asset (species or variant) is available in the campaign: its own, or a global one
   * for the campaign ruleset. Global drafts only exist for administrators. Archived assets only
   * stay while the campaign still uses them (`inUseAssetIds`), so characters that have one keep
   * seeing it; `archived: "always"` is for GMs managing their own content and for the selection
   * check, which answers 409 instead. Players only see what `isVisibleToPlayerInCampaign` allows.
   * Callers inside a transaction pass its handle as `db`.
   */
  async isAvailableInCatalog(
    viewer: CampaignAssetViewer & { isAdmin: boolean },
    asset: AssetRow,
    access: CatalogAccess,
    db: AppDatabase = this.db,
  ): Promise<boolean> {
    return (await this.filterAvailableInCatalog(viewer, [asset], access, db)).has(asset.id);
  }

  /** Ids of those assets that `isAvailableInCatalog` accepts, with one ruleset query for all. */
  async filterAvailableInCatalog(
    viewer: CampaignAssetViewer & { isAdmin: boolean },
    candidates: readonly AssetRow[],
    access: CatalogAccess,
    db: AppDatabase = this.db,
  ): Promise<Set<string>> {
    const global = candidates.filter(
      (asset) => asset.campaignId === null && (asset.status !== "DRAFT" || viewer.isAdmin),
    );
    const compatible = await this.assets.repository.listCompatibleIds(
      db,
      global.map((asset) => asset.id),
      viewer.rulesetId,
    );

    return new Set(
      candidates
        .filter((asset) => {
          if (asset.campaignId === null ? !compatible.has(asset.id) : asset.campaignId !== viewer.campaignId) {
            return false;
          }

          if (
            asset.status === "ARCHIVED" &&
            (access.archived === "ifInUse" || viewer.view === "PLAYER") &&
            !access.inUseAssetIds.has(asset.id)
          ) {
            return false;
          }

          return (
            viewer.view !== "PLAYER" ||
            this.assets.isVisibleToPlayerInCampaign(asset, access.visibleAssetIds, access.inUseAssetIds)
          );
        })
        .map((asset) => asset.id),
    );
  }

  /** A species available in the campaign, see `isAvailableInCatalog`; otherwise 404. */
  async requireCatalogSpecies(
    viewer: CampaignAssetViewer & { isAdmin: boolean },
    speciesId: string,
    access: CatalogAccess,
    db: AppDatabase = this.db,
  ): Promise<SpeciesWithAsset> {
    const found = await this.requireSpecies(db, speciesId);

    if (!(await this.isAvailableInCatalog(viewer, found.asset, access, db))) {
      throw new NotFoundError("Species not found");
    }

    return found;
  }

  async loadRecord(db: AppDatabase, found: SpeciesWithAsset): Promise<SpeciesRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as SpeciesRecord;
  }

  async loadRecords(db: AppDatabase, items: readonly SpeciesWithAsset[]): Promise<SpeciesRecord[]> {
    const rulesetIds = await this.assets.repository.listRulesetIds(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  /**
   * Which assets these grants refer to a player may see: active global assets, campaign assets
   * visible to the player and archived ones the campaign still uses. Used to strip hidden
   * references from the player view.
   */
  async playerReferenceVisibility(
    db: AppDatabase,
    grantLists: readonly (readonly SpeciesFeatureGrant[])[],
    visibleAssetIds: ReadonlySet<string>,
    inUseAssetIds: ReadonlySet<string> = new Set(),
  ): Promise<(assetId: string) => boolean> {
    const ids = grantLists.flatMap((grants) => [
      ...collectGrantReferences(grants).map((item) => item.assetId),
      ...staticBindingValues(grants),
    ]);
    const referenced = await this.assets.findMany(ids, db);

    return (assetId) => {
      const asset = referenced.get(assetId);

      return (
        asset !== undefined &&
        this.assets.isVisibleToPlayerInCampaign(asset, visibleAssetIds, inUseAssetIds)
      );
    };
  }

  /**
   * Custom features a released species or variant grants or targets. Players of the campaign may
   * see them through it; global features are visible anyway. Read without parsing the
   * definitions, so one stored definition that no longer parses cannot break player reads.
   */
  async listReleasedFeatureIds(input: { campaignId: string }, db: AppDatabase): Promise<string[]> {
    const ids = await this.repository.listReleasedReferencedIds(db, input.campaignId);
    const found = await this.assets.findMany(ids, db);

    return [...found.values()]
      .filter((asset) => asset.assetType === "FEATURE" && asset.campaignId === input.campaignId)
      .map((asset) => asset.id);
  }

  /** Edit routes for asset-links, for all custom species of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, item]) => item.species.campaignId === input.campaignId)
        .map(([assetId, item]) => [
          assetId,
          `/campaigns/${input.campaignId}/species/${item.species.id}`,
        ]),
    );
  }

  /** Edit routes of custom variants, for asset-links. */
  async findVariantEditRoutes(
    input: { campaignId: string; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findVariantsByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, item]) => item.variant.campaignId === input.campaignId)
        .map(([assetId, item]) => [
          assetId,
          `/campaigns/${input.campaignId}/species/${item.variant.speciesId}/variants/${item.variant.id}`,
        ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global content is changed by administrators only; custom content by GMs, editors and
   * administrators of the campaign. Non-members get 404.
   */
  async assertCanWrite(
    context: RequestContext,
    campaignId: string | null,
    db: AppDatabase,
  ): Promise<string> {
    if (campaignId === null) {
      this.assets.assertCanManage(context);
    } else {
      await this.assets.assertCanEditCampaignContent(context, campaignId, db);
    }

    return this.assets.assertAuthenticated(context);
  }

  /** Id of the acting user, after `assertCanWrite` checked the rights. */
  actorIdOf(context: RequestContext): string {
    return this.assets.assertAuthenticated(context);
  }

  /** Asset and species in the transaction of the action; any failure undoes both. */
  async createSpecies(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateSpeciesDto,
  ): Promise<SpeciesRecord> {
    const code =
      input.code ?? slugify(input.name, { fallback: "species" }).slice(0, 100).replace(/-+$/, "");
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "SPECIES",
        title: input.name,
        // Codes are unique per scope and ruleset, names may repeat.
        slug: slugify(input.name, { unique: true, fallback: "species" }),
        summary: input.summary ?? null,
        status: input.status,
        releasedToPlayers: input.releasedToPlayers,
        rulesetPolicy: input.rulesetPolicy,
        ...(input.rulesetIds !== undefined ? { rulesetIds: input.rulesetIds } : {}),
        ...(input.assetFamilyId !== undefined ? { assetFamilyId: input.assetFamilyId } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      },
    );
    const definition: SpeciesDefinition = {
      sizeOptions: input.sizeOptions,
      movementModes: input.movementModes,
      ageProfile: input.ageProfile,
      physicalProfile: input.physicalProfile,
      textSections: input.textSections,
      variantGroups: input.variantGroups,
      featureGrants: input.featureGrants,
    };
    const row = {
      campaignId: params.campaignId,
      assetId: asset.id,
      code,
      description: input.description ?? null,
      creatureType: input.creatureType,
      lifespanMode: input.lifespanMode,
      displayOrder: input.displayOrder,
      ...definition,
    };

    // Creating runs no history guard, so code and references are checked here.
    await this.assertSpeciesValid(scope.tx, { ...row, id: null }, definition);

    const created = await this.withConstraintErrors(() => scope.create(this.trackedSpecies, row));

    return this.loadRecord(scope.tx, await this.requireSpecies(scope.tx, created.id));
  }

  /**
   * Asset fields first, then the species. `merged` names the fields of both that kept a newer
   * value from somebody else. When the rulesets change, the rules are checked again, because the
   * history guard only runs when the species row itself changes.
   */
  async updateSpecies(
    scope: ActionScope,
    params: { found: SpeciesWithAsset; actorId: string; command: UpdateSpeciesDto },
  ): Promise<{ record: SpeciesRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command;
    const { species: row, asset } = params.found;

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived species cannot be modified", { assetId: asset.id });
    }

    const merged = await this.updateAssetFields(scope, {
      assetId: asset.id,
      expectedAssetVersion,
      actorId: params.actorId,
      fields,
    });
    const set = rowFields(fields);
    let changed = false;

    if (Object.keys(set).length > 0) {
      const result = await this.withConstraintErrors(() =>
        scope.change(this.trackedSpecies, row.id, async (current) => ({
          set: await this.withBaseDefinition(scope, current, set, expectedVersion),
          baseVersion: expectedVersion,
        })),
      );

      changed = result.changed;
      merged.push(...result.merged);
    }

    const found = await this.requireSpecies(scope.tx, row.id);

    if (!changed && (fields.rulesetIds !== undefined || fields.rulesetPolicy !== undefined)) {
      await this.assertSpeciesValid(
        scope.tx,
        found.species,
        parseSpeciesDefinition(found.species),
      );
    }

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
    current: SpeciesRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const group: readonly string[] = SPECIES_DEFINITION_GROUP;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => group.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of SPECIES_DEFINITION_GROUP) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedSpecies, current.id, part, baseVersion);

        if (stored.known) {
          completed[part] = stored.value;
        }
      }
    }

    return completed;
  }

  /** Asset fields of a species or variant update; returns the merged field names. */
  async updateAssetFields(
    scope: ActionScope,
    params: {
      assetId: string;
      expectedAssetVersion: number;
      actorId: string;
      fields: Partial<Record<(typeof ASSET_FIELDS)[number], unknown>>;
    },
  ): Promise<string[]> {
    const patch = Object.fromEntries(
      ASSET_FIELDS.filter((key) => params.fields[key] !== undefined).map((key) => [
        key === "name" ? "title" : key,
        params.fields[key],
      ]),
    );

    if (Object.keys(patch).length === 0) {
      return [];
    }

    const result = await this.assets.updateMetadata(scope, {
      assetId: params.assetId,
      expectedVersion: params.expectedAssetVersion,
      actorId: params.actorId,
      patch,
    });

    return result.merged.map((field) => ASSET_FIELD_NAMES[field] ?? field);
  }

  /** Archives the asset; fails while variants or other definitions still refer to it. */
  async archiveSpecies(
    scope: ActionScope,
    params: { found: SpeciesWithAsset; expectedAssetVersion: number },
  ): Promise<SpeciesRecord> {
    await this.assets.archiveBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireSpecies(scope.tx, params.found.species.id));
  }

  async restoreSpecies(
    scope: ActionScope,
    params: { found: SpeciesWithAsset; expectedAssetVersion: number },
  ): Promise<SpeciesRecord> {
    await this.assets.restoreBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    // The rules are checked by `assertReactivatable`, on every path that unarchives.
    return this.loadRecord(scope.tx, await this.requireSpecies(scope.tx, params.found.species.id));
  }

  /**
   * Runs when a species or variant asset leaves ARCHIVED, through the restore route, undoing or
   * restoring a version. While archived it kept nothing from being archived, another global
   * species may have taken its code, and a variant's species may have changed, so the rules are
   * checked again.
   */
  async assertReactivatable(asset: AssetRow, db: AppDatabase): Promise<void> {
    if (asset.assetType === "SPECIES") {
      const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

      if (found) {
        await this.assertSpeciesValid(db, found.species, parseSpeciesDefinition(found.species));
      }

      return;
    }

    if (asset.assetType === "SPECIES_VARIANT") {
      const found = (await this.repository.findVariantsByAssetIds(db, [asset.id])).get(asset.id);

      if (found) {
        await this.assertVariantValid(db, {
          ...found.variant,
          featureGrants: parseVariantGrants(found.variant),
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Rules that need the database
  // ---------------------------------------------------------------------------

  /**
   * Everything a species must satisfy beyond its own parts: the code per ruleset, its grants
   * (references, bindings, the 2024 ability rule) and that its variants still fit it (groups,
   * upgrade targets, rulesets).
   */
  async assertSpeciesValid(
    db: AppDatabase,
    row: Pick<SpeciesRow, "assetId" | "campaignId" | "code"> & { id: string | null },
    definition: SpeciesDefinition,
  ): Promise<void> {
    if (row.id !== null) {
      // Variant writes take the same lock, so they cannot slip in between this check and the commit.
      await this.repository.lockSpecies(db, row.id);
    }

    await this.assertSystemCodeFree(db, row);

    const { missing, issues } = await this.collectGrantIssues(db, row, definition.featureGrants);

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError("Species definition refers to unavailable assets", { issues });
    }

    if (row.id !== null) {
      const variantIssues = await this.collectVariantFitIssues(db, row.id, row.assetId, definition);

      if (variantIssues.length > 0) {
        throw new ConflictError("Variants of the species no longer fit it", {
          issues: variantIssues,
        });
      }
    }
  }

  /**
   * A variant against its species and the other variants: groups, grants, keys, rulesets, the
   * ability rule. Throws the first failing category, see `collectVariantIssues`.
   */
  async assertVariantValid(
    db: AppDatabase,
    row: VariantCheckRow,
    options: { lock: boolean } = { lock: true },
  ): Promise<void> {
    const result = await this.collectVariantIssues(db, row, options);

    if (result.notFound) {
      throw new NotFoundError("Species not found");
    }

    if (result.speciesArchived) {
      throw new ConflictError("The species of the variant is archived", { speciesId: row.speciesId });
    }

    if (result.fit.length > 0) {
      throw new ConflictError("The variant does not fit its species", { issues: result.fit });
    }

    if (result.missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: result.missing });
    }

    if (result.references.length > 0) {
      throw new ConflictError("Variant definition refers to unavailable assets", {
        issues: result.references,
      });
    }
  }

  /**
   * Every issue of a variant, by category. With `lock` (writes) it first takes a share lock on the
   * species asset, which keeps the species from being archived meanwhile, and then the species
   * row, which a concurrent change of the species or another variant holds; both in the order a
   * species update takes them (asset, then row). Species and variants are read after the locks.
   * Read-only checks outside a transaction (`validate`) pass `lock: false`: a lock there protects
   * nothing and would only wait for writers.
   */
  private async collectVariantIssues(
    db: AppDatabase,
    row: VariantCheckRow,
    options: { lock: boolean },
  ): Promise<{
    notFound: boolean;
    speciesArchived: boolean;
    fit: DefinitionIssue[];
    missing: DefinitionIssue[];
    references: DefinitionIssue[];
  }> {
    if (options.lock) {
      const unlocked = await this.repository.findById(db, row.speciesId);

      if (unlocked) {
        await this.assets.lockForUse([unlocked.asset.id], db);
      }

      await this.repository.lockSpecies(db, row.speciesId);
    }

    const base = await this.repository.findById(db, row.speciesId);

    if (!base || base.species.campaignId !== row.campaignId) {
      return { notFound: true, speciesArchived: false, fit: [], missing: [], references: [] };
    }

    const siblings = siblingVariants(
      await this.repository.listVariants(db, row.speciesId),
      row.assetId,
    );
    const fit = [
      ...validateVariantDefinition(row, parseSpeciesDefinition(base.species), siblings),
      ...(await this.collectRulesetCoverageIssues(db, base.asset, row.assetId)),
    ];
    const { missing, issues } = await this.collectGrantIssues(db, row, row.featureGrants, options);

    return {
      notFound: false,
      speciesArchived: base.asset.status === "ARCHIVED",
      fit,
      missing,
      references: issues,
    };
  }

  /**
   * Global species share codes across rulesets (2014 and 2024 elf), but two active global species
   * with the same code must not both be available for one ruleset; a neutral species is available
   * for all of them. Custom species are kept unique per campaign by an index.
   */
  async assertSystemCodeFree(
    db: AppDatabase,
    row: Pick<SpeciesRow, "assetId" | "campaignId" | "code"> & { id: string | null },
    options: { lock: boolean } = { lock: true },
  ): Promise<void> {
    if (row.campaignId !== null) {
      return;
    }

    if (options.lock) {
      await this.repository.lockSystemCode(db, row.code);
    }

    const others = (
      await this.repository.listSystemByCode(db, {
        code: row.code,
        exceptSpeciesId: row.id ?? "00000000-0000-0000-0000-000000000000",
      })
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
        throw new ConflictError("Species code is already used for one of these rulesets", {
          code: row.code,
          assetId: asset.id,
        });
      }
    }
  }

  /**
   * Issues of grants that need the database: referenced features (missing and foreign ones apart,
   * as 404), features whose stored definition no longer parses, bindings against the parameters of
   * the granted feature, no feature that depends on a class level, and for 2024 rulesets no feature
   * that raises ability scores. Each feature is loaded and parsed once. With `lock` (writes) the
   * granted features stay share-locked until the transaction ends, so a concurrent change or
   * archive of one of them waits instead of slipping past these checks; `validate` passes false.
   */
  async collectGrantIssues(
    db: AppDatabase,
    owner: GrantOwner,
    grants: readonly SpeciesFeatureGrant[],
    options: { lock: boolean } = { lock: true },
  ): Promise<{ missing: DefinitionIssue[]; issues: DefinitionIssue[] }> {
    const ownIssues: DefinitionIssue[] = [];
    const references: AssetReference[] = [...collectGrantReferences(grants)];
    const inspected = await this.features.inspectFeatures(
      db,
      // Targets of upgrades and replacements are locked too: the grant depends on them as well.
      grants.flatMap((grant) =>
        grant.targetFeatureAssetId === null
          ? [grant.featureAssetId]
          : [grant.featureAssetId, grant.targetFeatureAssetId],
      ),
      { lock: options.lock },
    );
    const campaignRulesetId =
      owner.campaignId === null ? null : await this.campaignAccess.findRulesetId(owner.campaignId, db);
    const abilityRuleApplies =
      grants.some((grant) => {
        const feature = inspected.get(grant.featureAssetId);

        return feature?.valid === true && feature.raisesAbilityScore;
      }) &&
      (
        await this.abilityRuleOwners(
          db,
          [owner],
          new Map(owner.campaignId === null ? [] : [[owner.campaignId, campaignRulesetId]]),
        )
      ).size > 0;

    grants.forEach((grant, grantIndex) => {
      const path = ["featureGrants", grantIndex];
      const feature = inspected.get(grant.featureAssetId);

      if (!feature) {
        // Not a feature (or no feature row); the reference check reports it.
        return;
      }

      if (!feature.valid) {
        ownIssues.push({
          path: [...path, "featureAssetId"],
          message: "The stored definition of the granted feature is invalid",
        });
        return;
      }

      if (feature.usesClassLevel) {
        ownIssues.push({ path: [...path, "featureAssetId"], message: CLASS_LEVEL_MESSAGE });
      }

      if (abilityRuleApplies && feature.raisesAbilityScore) {
        ownIssues.push({
          path: [...path, "featureAssetId"],
          message: `Species of rulesets from ${ABILITY_INCREASE_FREE_EDITION_YEAR} on grant no ability score increases; they come from the background`,
        });
      }

      const bound = new Set(grant.bindings.map((binding) => binding.parameterKey));

      for (const parameter of feature.parameters) {
        if (parameter.required && parameter.defaultValue === null && !bound.has(parameter.key)) {
          ownIssues.push({
            path: [...path, "bindings"],
            message: `Required parameter '${parameter.key}' is not bound`,
          });
        }
      }

      grant.bindings.forEach((binding, bindingIndex) => {
        const bindingPath = [...path, "bindings", bindingIndex];
        const parameter = feature.parameters.find((item) => item.key === binding.parameterKey);
        const report = (message: string) => ownIssues.push({ path: bindingPath, message });

        if (!parameter) {
          report(`The feature has no parameter '${binding.parameterKey}'`);
          return;
        }

        if (binding.bindingSource === "STATIC") {
          checkTypedValue(parameter.valueType, binding.staticValue).forEach(report);

          if (parameter.valueType === "ASSET_REF" && typeof binding.staticValue === "string") {
            references.push({
              assetId: binding.staticValue,
              path: [...bindingPath, "staticValue"],
              assetTypes: ASSET_TYPES,
            });
          }
        } else if (parameter.valueType !== "INTEGER" && parameter.valueType !== "DECIMAL") {
          report(`A context value cannot fill a ${parameter.valueType} parameter`);
        }
      });
    });

    const result = await this.assets.collectReferenceIssues(
      db,
      { assetId: owner.assetId, campaignId: owner.campaignId, campaignRulesetId },
      references,
    );

    return { missing: result.missing, issues: [...result.issues, ...ownIssues] };
  }

  /**
   * Those of the owners that are used with a ruleset from 2024 on: the campaign ruleset for custom
   * content; for global content one of its rulesets, or any when it is neutral. Loads the rulesets
   * and edition years of all owners at once. `campaignRulesets` caches campaign rulesets a caller
   * already loaded.
   */
  private async abilityRuleOwners(
    db: AppDatabase,
    owners: readonly GrantOwner[],
    campaignRulesets: Map<string, string | null> = new Map(),
  ): Promise<Set<string>> {
    const unknownCampaigns = owners.flatMap((owner) =>
      owner.campaignId !== null && !campaignRulesets.has(owner.campaignId) ? [owner.campaignId] : [],
    );

    if (unknownCampaigns.length > 0) {
      const found = await this.campaignAccess.findRulesetIds(unknownCampaigns, db);

      for (const campaignId of unknownCampaigns) {
        campaignRulesets.set(campaignId, found.get(campaignId) ?? null);
      }
    }

    const globalIds = owners.filter((owner) => owner.campaignId === null).map((owner) => owner.assetId);
    const globalAssets = await this.assets.findMany(globalIds, db);
    const globalRulesets = await this.assets.repository.listRulesetIds(db, globalIds);
    // null: neutral, used with every ruleset.
    const rulesetsOf = (owner: GrantOwner): readonly string[] | null => {
      if (owner.campaignId !== null) {
        const rulesetId = campaignRulesets.get(owner.campaignId);

        return rulesetId ? [rulesetId] : [];
      }

      return globalAssets.get(owner.assetId)?.rulesetPolicy === "NEUTRAL"
        ? null
        : (globalRulesets.get(owner.assetId) ?? []);
    };
    const years = await this.campaignAccess.findEditionYears(
      owners.flatMap((owner) => rulesetsOf(owner) ?? []),
      db,
    );

    return new Set(
      owners
        .filter((owner) => {
          const rulesetIds = rulesetsOf(owner);

          return (
            rulesetIds === null ||
            rulesetIds.some((id) => (years.get(id) ?? 0) >= ABILITY_INCREASE_FREE_EDITION_YEAR)
          );
        })
        .map((owner) => owner.assetId),
    );
  }

  /**
   * A global variant can only be offered where its species is: a restricted species needs a
   * restricted variant within its rulesets. Custom variants share the campaign ruleset.
   */
  async collectRulesetCoverageIssues(
    db: AppDatabase,
    speciesAsset: AssetRow,
    variantAssetId: string,
  ): Promise<DefinitionIssue[]> {
    if (speciesAsset.campaignId !== null || speciesAsset.rulesetPolicy === "NEUTRAL") {
      return [];
    }

    const variantAsset = await this.assets.requireAsset(db, variantAssetId);
    const rulesets = await this.assets.repository.listRulesetIds(db, [
      speciesAsset.id,
      variantAssetId,
    ]);

    return rulesetCoverageIssues(speciesAsset, variantAsset, rulesets);
  }

  /**
   * Variants that are not archived and would no longer fit the species definition: group, grants,
   * keys across the variants and rulesets. Reads the rulesets of all of them at once.
   */
  private async collectVariantFitIssues(
    db: AppDatabase,
    speciesId: string,
    speciesAssetId: string,
    definition: SpeciesDefinition,
  ): Promise<DefinitionIssue[]> {
    const variants = (await this.repository.listVariants(db, speciesId)).filter(
      ({ asset }) => asset.status !== "ARCHIVED",
    );

    if (variants.length === 0) {
      return [];
    }

    const speciesAsset = await this.assets.requireAsset(db, speciesAssetId);
    const rulesets = await this.assets.repository.listRulesetIds(db, [
      speciesAssetId,
      ...variants.map(({ asset }) => asset.id),
    ]);
    const issues: DefinitionIssue[] = [];

    for (const { variant, asset } of variants) {
      const grants = tryParseVariantGrants(variant);

      if (grants === null) {
        // Reported by validating the variant.
        continue;
      }

      const own = [
        ...validateVariantDefinition(
          { ...variant, featureGrants: grants },
          definition,
          siblingVariants(variants, asset.id),
        ),
        ...rulesetCoverageIssues(speciesAsset, asset, rulesets),
      ];

      issues.push(
        ...own.map((issue) => ({
          path: ["variants", variant.code, ...issue.path],
          message: issue.message,
        })),
      );
    }

    return issues;
  }

  /** Every issue of a stored species, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, found: SpeciesWithAsset): Promise<DefinitionIssue[]> {
    let definition: SpeciesDefinition;

    try {
      definition = parseSpeciesDefinition(found.species);
    } catch (error) {
      return issuesOf(error);
    }

    const issues: DefinitionIssue[] = [];

    if (found.asset.status === "ARCHIVED") {
      issues.push({ path: ["status"], message: "The species is archived" });
    }

    try {
      await this.assertSystemCodeFree(db, found.species, { lock: false });
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      issues.push({ path: ["code"], message: error.message });
    }

    const grants = await this.collectGrantIssues(db, found.species, definition.featureGrants, {
      lock: false,
    });
    const variants = await this.repository.listVariants(db, found.species.id);
    const usable = variants.filter(({ asset }) => asset.status === "ACTIVE");

    definition.variantGroups.forEach((group, index) => {
      const offered = usable.filter(({ variant }) => variant.variantGroupCode === group.code).length;

      if (offered < group.minimumSelections) {
        issues.push({
          path: ["variantGroups", index],
          message: `The group needs at least ${group.minimumSelections} active variants, it has ${offered}`,
        });
      }
    });

    for (const { variant, asset } of variants) {
      if (asset.status !== "ARCHIVED" && tryParseVariantGrants(variant) === null) {
        issues.push({
          path: ["variants", variant.code],
          message: "The stored grants of the variant are invalid; players do not see the variant",
        });
      }
    }

    return [
      ...issues,
      ...grants.missing,
      ...grants.issues,
      ...(await this.collectVariantFitIssues(db, found.species.id, found.asset.id, definition)),
    ];
  }

  /** Every issue of a stored variant, against its species; for `validate`. */
  async validateStoredVariant(db: AppDatabase, found: SpeciesVariantWithAsset): Promise<DefinitionIssue[]> {
    let featureGrants: SpeciesFeatureGrant[];

    try {
      featureGrants = parseVariantGrants(found.variant);
    } catch (error) {
      return issuesOf(error);
    }

    const issues: DefinitionIssue[] =
      found.asset.status === "ARCHIVED" ? [{ path: ["status"], message: "The variant is archived" }] : [];

    let result: Awaited<ReturnType<SpeciesService["collectVariantIssues"]>>;

    try {
      result = await this.collectVariantIssues(db, { ...found.variant, featureGrants }, { lock: false });
    } catch (error) {
      // The species definition no longer parses.
      return [...issues, ...issuesOf(error)];
    }

    if (result.notFound) {
      return [...issues, { path: ["speciesId"], message: "Species not found" }];
    }

    if (result.speciesArchived) {
      issues.push({ path: ["speciesId"], message: "The species of the variant is archived" });
    }

    // Every category at once, unlike a write, which stops at the first.
    return [...issues, ...result.fit, ...result.missing, ...result.references];
  }

  /**
   * Change guard of the features module. A feature that species or variants grant may not start
   * to depend on a class level, and one that species or variants of rulesets from 2024 on grant
   * may not start raising ability scores. Without it the rules would only be checked when the
   * species is written. Archived species are checked again when they come back.
   */
  async assertFeatureChangeAllowed(
    change: Parameters<FeatureChangeGuard>[0],
    db: AppDatabase,
  ): Promise<void> {
    const raises = raisesAbilityScore(change.graph);
    const classLevel = usesClassLevel(change.graph);

    if (!raises && !classLevel) {
      return;
    }

    const input = { assetId: change.assetId, campaignId: change.campaignId, includeArchived: false };
    const owners = [
      ...(await this.repository.listReferencing(db, input)).map(({ species: row, asset }) => ({
        row,
        asset,
        assetType: "SPECIES" as const,
      })),
      ...(await this.repository.listVariantsReferencing(db, input)).map(({ variant, asset }) => ({
        row: variant,
        asset,
        assetType: "SPECIES_VARIANT" as const,
      })),
    ].filter(({ row }) => grantsFeature(row.featureGrants, change.assetId));
    const usagesOf = (items: typeof owners) =>
      items.map(({ asset, assetType }) => ({ assetId: asset.id, assetType, name: asset.title }));

    if (classLevel && owners.length > 0) {
      throw new ConflictError(
        "Species and variants grant this feature, so it may not depend on a class level",
        { usages: usagesOf(owners) },
      );
    }

    if (!raises || owners.length === 0) {
      return;
    }

    const applies = await this.abilityRuleOwners(
      db,
      owners.map(({ row, asset }) => ({ assetId: asset.id, campaignId: row.campaignId })),
    );
    const usages = usagesOf(owners.filter(({ asset }) => applies.has(asset.id)));

    if (usages.length > 0) {
      throw new ConflictError(
        `Species of rulesets from ${ABILITY_INCREASE_FREE_EDITION_YEAR} on grant this feature, so it may not raise ability scores`,
        { usages },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Usages
  // ---------------------------------------------------------------------------

  /** Species and variants whose definitions refer to the asset, as typed usages for asset-links. */
  async listUsages(
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
    db: AppDatabase,
  ): Promise<AssetUsageItemDto[]> {
    const speciesRows = await this.repository.listReferencing(db, input);
    const variantRows = await this.repository.listVariantsReferencing(db, input);

    return [
      ...speciesRows.map(({ species: row, asset }) => ({
        id: row.id,
        type: "SPECIES_DEFINITION",
        label: asset.title,
        assetId: asset.id,
        assetType: "SPECIES" as const,
        editRoute:
          row.campaignId === null ? `/species/${row.id}` : `/campaigns/${row.campaignId}/species/${row.id}`,
      })),
      ...variantRows.map(({ variant, asset }) => ({
        id: variant.id,
        type: "SPECIES_VARIANT_DEFINITION",
        label: asset.title,
        assetId: asset.id,
        assetType: "SPECIES_VARIANT" as const,
        editRoute:
          variant.campaignId === null
            ? `/species/${variant.speciesId}/variants/${variant.id}`
            : `/campaigns/${variant.campaignId}/species/${variant.speciesId}/variants/${variant.id}`,
      })),
    ];
  }

  async getUsages(viewer: CampaignAssetViewer, assetId: string, visibleAssetIds: ReadonlySet<string>) {
    return this.links.getUsages(viewer, assetId, visibleAssetIds);
  }

  async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("Code is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign, species or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The species violates a database constraint");
      }

      throw error;
    }
  }
}

/** Fields of an update that belong to the row, not to the asset. */
export function rowFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => value !== undefined && !(ASSET_FIELDS as readonly string[]).includes(key),
    ),
  );
}

/** Issues carried by an error, or the error message as one issue. */
function issuesOf(error: unknown): DefinitionIssue[] {
  if (!(error instanceof ValidationError || error instanceof ConflictError || error instanceof NotFoundError)) {
    throw error;
  }

  const details = (error as { details?: unknown }).details;
  const list = Array.isArray(details)
    ? details
    : Array.isArray((details as { issues?: unknown } | undefined)?.issues)
      ? ((details as { issues: unknown[] }).issues)
      : null;

  if (!list) {
    return [{ path: [], message: error.message }];
  }

  return list.map((issue) => {
    const item = issue as { path?: (string | number | symbol)[]; message?: string };

    return {
      path: (item.path ?? []).map((segment) => (typeof segment === "number" ? segment : String(segment))),
      message: item.message ?? "Invalid",
    };
  });
}

/** The other variants, archived ones and those whose grants no longer parse left out. */
function siblingVariants(
  variants: readonly SpeciesVariantWithAsset[],
  exceptAssetId: string,
): SiblingVariant[] {
  return variants.flatMap(({ variant, asset }) => {
    if (asset.id === exceptAssetId || asset.status === "ARCHIVED") {
      return [];
    }

    const featureGrants = tryParseVariantGrants(variant);

    return featureGrants === null ? [] : [{ code: variant.code, featureGrants }];
  });
}

/** Rule of `collectRulesetCoverageIssues` with the rulesets already loaded. */
function rulesetCoverageIssues(
  speciesAsset: AssetRow,
  variantAsset: AssetRow,
  rulesets: ReadonlyMap<string, readonly string[]>,
): DefinitionIssue[] {
  if (speciesAsset.campaignId !== null || speciesAsset.rulesetPolicy === "NEUTRAL") {
    return [];
  }

  const speciesRulesets = new Set(rulesets.get(speciesAsset.id) ?? []);
  const covered =
    variantAsset.rulesetPolicy !== "NEUTRAL" &&
    (rulesets.get(variantAsset.id) ?? []).every((id) => speciesRulesets.has(id));

  return covered
    ? []
    : [{ path: ["rulesetIds"], message: "A variant is only available within the rulesets of its species" }];
}

/** Whether stored grants grant the feature, read from the raw json like the visibility provider. */
function grantsFeature(featureGrants: unknown, featureAssetId: string): boolean {
  return (
    Array.isArray(featureGrants) &&
    featureGrants.some(
      (grant) => (grant as { featureAssetId?: unknown } | null)?.featureAssetId === featureAssetId,
    )
  );
}
