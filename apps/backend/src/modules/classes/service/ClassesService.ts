import type { ContentReadPurpose } from "#core/content/access";
import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { UUID_PATTERN } from "#core/uuid";
import type { AssetLinksService, AssetUsageItemDto } from "#src/modules/asset-links/index";
import {
  ASSET_TYPES,
  type AssetReference,
  type AssetRow,
  type AssetsService,
  type ContentAccess,
  slugify,
} from "#src/modules/assets/index";
import type { ClassDefinition } from "#src/modules/classes/domain/dto/ClassDefinitionDto";
import { type CreateClassDto, fillLevels } from "#src/modules/classes/domain/dto/CreateClassDto";
import type { UpdateClassDto } from "#src/modules/classes/domain/dto/UpdateClassDto";
import {
  collectClassReferences,
  type DefinitionIssue,
  listGrants,
} from "#src/modules/classes/domain/ClassDefinition";
import type {
  ClassRecord,
  ClassRow,
  ClassesRepository,
  ClassWithAsset,
} from "#src/modules/classes/domain/repository/ClassesRepository";
import {
  CLASS_DEFINITION_GROUP,
  createTrackedClass,
  parseClassDefinition,
  type TrackedClass,
} from "#src/modules/classes/history/TrackedClass";
import { checkTypedValue, type FeaturesService } from "#src/modules/features/index";

/** Campaign facts the module needs; provided by the campaigns module. */
export type ClassCampaignAccessPort = {
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

/** Parameter types a progression track of this value type can fill. */
const TRACK_PARAMETER_TYPES: Record<string, readonly string[]> = {
  INTEGER: ["INTEGER", "DECIMAL"],
  BONUS: ["INTEGER", "DECIMAL"],
  DIE: ["DIE"],
  DISTANCE: ["DISTANCE"],
  TEXT: ["TEXT"],
};

/**
 * Class definitions: global ones, maintained by administrators per ruleset and usable by every
 * campaign of a fitting ruleset, and custom ones of a campaign. Each class is an asset of type
 * `CLASS`; the asset holds name, summary, status and rulesets, the class row the definition. Actor
 * progression reads classes through this service and stores characters' levels and choices itself.
 */
export class ClassesService {
  public readonly trackedClass: TrackedClass;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: ClassesRepository,
    private readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    private readonly features: FeaturesService,
    private readonly campaignAccess: ClassCampaignAccessPort,
  ) {
    this.trackedClass = createTrackedClass({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (row, tx) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived classes cannot be modified", { assetId: asset.id });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireClass(db: AppDatabase, classId: string): Promise<ClassWithAsset> {
    const found = await this.repository.findById(db, classId);

    if (!found) {
      throw new NotFoundError("Class not found");
    }

    return found;
  }

  /** A custom class of the campaign; global classes and those of other campaigns are 404. */
  async requireCampaignClass(
    db: AppDatabase,
    path: { campaignId: string; classId: string },
  ): Promise<ClassWithAsset> {
    const found = await this.requireClass(db, path.classId);

    if (found.characterClass.campaignId !== path.campaignId) {
      throw new NotFoundError("Class not found");
    }

    return found;
  }

  /** A global class; custom classes are 404 here. */
  async requireSystemClass(db: AppDatabase, classId: string): Promise<ClassWithAsset> {
    const found = await this.requireClass(db, classId);

    if (found.characterClass.campaignId !== null) {
      throw new NotFoundError("Class not found");
    }

    return found;
  }

  /**
   * A class of the campaign the viewer may read for this purpose (`ContentReadPurpose`): `MANAGE`
   * for the routes of the campaign's own classes, `CATALOG` for what the campaign may choose.
   * Archived classes stay in the catalog while the campaign still uses them.
   */
  async requireReadableClass(
    access: ContentAccess,
    classId: string,
    purpose: ContentReadPurpose,
  ): Promise<ClassWithAsset> {
    const found = await this.requireClass(this.db, classId);

    await access.require(purpose, found.asset, "Class not found");

    return found;
  }

  /**
   * A class that may be newly chosen in the campaign, for actor progression: in the catalog and
   * active. Archived classes in use stay readable but cannot be chosen again (409).
   */
  async requireSelectableClass(
    access: ContentAccess,
    classId: string,
  ): Promise<ClassWithAsset & { definition: ClassDefinition }> {
    const found = await this.requireReadableClass(access, classId, "CATALOG");

    if (found.asset.status !== "ACTIVE") {
      throw new ConflictError("Only active classes can be chosen", {
        classId,
        status: found.asset.status,
      });
    }

    return { ...found, definition: parseClassDefinition(found.characterClass) };
  }

  async loadRecord(db: AppDatabase, found: ClassWithAsset): Promise<ClassRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as ClassRecord;
  }

  async loadRecords(db: AppDatabase, items: readonly ClassWithAsset[]): Promise<ClassRecord[]> {
    const rulesetIds = await this.assets.repository.listRulesetIds(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  /**
   * Which referenced assets of these classes the viewer may read; used to strip hidden references
   * from the player view. Without access (outside a campaign) only active global assets count.
   */
  async playerReferenceVisibility(
    db: AppDatabase,
    items: readonly ClassWithAsset[],
    access: ContentAccess | null,
  ): Promise<(assetId: string) => boolean> {
    const ids = items.flatMap(({ characterClass }) => {
      const definition = parseClassDefinition(characterClass);

      return [
        ...collectClassReferences(definition).map((item) => item.assetId),
        ...this.staticAssetValues(definition),
      ];
    });
    const referenced = [...(await this.assets.findMany(ids, db)).values()];
    const readable = access
      ? await access.readableIds("READ", referenced, db)
      : new Set(
          referenced
            .filter((asset) => asset.scope === "SYSTEM" && asset.status === "ACTIVE")
            .map((asset) => asset.id),
        );

    return (assetId) => readable.has(assetId);
  }

  /**
   * Custom features a released class grants, upgrades to or offers as options. Players of the
   * campaign may see them through the class; global features are visible anyway. Read without
   * parsing the definitions: this runs for every player request in every module, so one stored
   * definition that no longer parses must not break it.
   */
  async listReleasedFeatureIds(
    input: { campaignId: string },
    db: AppDatabase,
  ): Promise<string[]> {
    const ids = await this.repository.listReleasedReferencedIds(db, input.campaignId);
    const found = await this.assets.findMany(ids, db);

    return [...found.values()]
      .filter((asset) => asset.assetType === "FEATURE" && asset.campaignId === input.campaignId)
      .map((asset) => asset.id);
  }

  /** Edit routes for asset-links, for all custom classes of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, { characterClass }]) => characterClass.campaignId === input.campaignId)
        .map(([assetId, { characterClass }]) => [
          assetId,
          `/campaigns/${input.campaignId}/classes/${characterClass.id}`,
        ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global classes are changed by administrators only; custom classes by GMs, editors and
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

  /** The class of a write route: a custom one of the campaign, or a global one without it. */
  async requireForWrite(
    db: AppDatabase,
    path: { campaignId: string | null; classId: string },
  ): Promise<ClassWithAsset> {
    return path.campaignId === null
      ? this.requireSystemClass(db, path.classId)
      : this.requireCampaignClass(db, { campaignId: path.campaignId, classId: path.classId });
  }

  /** Asset and class in the transaction of the action; any failure undoes both. */
  async createClass(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateClassDto,
  ): Promise<ClassRecord> {
    const code =
      input.code ?? slugify(input.name, { fallback: "class" }).slice(0, 100).replace(/-+$/, "");
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "CLASS",
        title: input.name,
        // Codes are unique per scope and ruleset, names may repeat.
        slug: slugify(input.name, { unique: true, fallback: "class" }),
        summary: input.summary ?? null,
        status: input.status,
        releasedToPlayers: input.releasedToPlayers,
        rulesetPolicy: input.rulesetPolicy,
        ...(input.rulesetIds !== undefined ? { rulesetIds: input.rulesetIds } : {}),
        ...(input.assetFamilyId !== undefined ? { assetFamilyId: input.assetFamilyId } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      },
    );
    const definition: ClassDefinition = {
      primaryAbilities: input.primaryAbilities,
      proficiencies: input.proficiencies,
      startingEquipment: input.startingEquipment,
      progressionTracks: input.progressionTracks,
      levels: fillLevels(input.maximumLevel, input.levels),
      choices: input.choices,
      spellcasting: input.spellcasting,
      multiclass: input.multiclass,
    };
    const row = {
      campaignId: params.campaignId,
      assetId: asset.id,
      code,
      description: input.description ?? null,
      maximumLevel: input.maximumLevel,
      hitDie: input.hitDie,
      firstLevelHitPoints: input.firstLevelHitPoints,
      fixedHitPointsPerLevel: input.fixedHitPointsPerLevel,
      subclassSelectionLevel: input.subclassSelectionLevel,
      displayOrder: input.displayOrder,
      ...definition,
    };

    const created = await this.withConstraintErrors(() =>
      scope.create(this.trackedClass, row),
    );

    return this.loadRecord(scope.tx, await this.requireClass(scope.tx, created.id));
  }

  /**
   * Asset fields first, then the class. `merged` names the fields of both that kept a newer value
   * from somebody else. When the rulesets change, code and references are checked again, because
   * the history guard only runs when the class row itself changes.
   */
  async updateClass(
    scope: ActionScope,
    params: { found: ClassWithAsset; actorId: string; command: UpdateClassDto },
  ): Promise<{ record: ClassRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command;
    const { characterClass, asset } = params.found;
    const merged: string[] = [];

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived classes cannot be modified", { assetId: asset.id });
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
        scope.change(this.trackedClass, characterClass.id, async (current) => ({
          set: await this.withBaseDefinition(scope, current, set, expectedVersion),
          baseVersion: expectedVersion,
        })),
      );

      merged.push(...result.merged);
    }

    const found = await this.requireClass(scope.tx, characterClass.id);

    return { record: await this.loadRecord(scope.tx, found), merged };
  }

  /**
   * The history compares only the fields that were sent. A client that changes one part sends the
   * others unchanged in its mind, so they are added with their value at its base version: when
   * somebody else changed one of them in the meantime, the group makes that a conflict instead of
   * a mix of two versions.
   */
  private async withBaseDefinition(
    scope: ActionScope,
    current: ClassRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const group: readonly string[] = CLASS_DEFINITION_GROUP;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => group.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of CLASS_DEFINITION_GROUP) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedClass, current.id, part, baseVersion);

        if (stored.known) {
          completed[part] = stored.value;
        }
      }
    }

    return completed;
  }

  /** Archives the asset; fails while other definitions still refer to it. */
  async archiveClass(
    scope: ActionScope,
    params: { found: ClassWithAsset; expectedAssetVersion: number },
  ): Promise<ClassRecord> {
    await this.assets.archiveBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireClass(scope.tx, params.found.characterClass.id));
  }

  async restoreClass(
    scope: ActionScope,
    params: { found: ClassWithAsset; expectedAssetVersion: number },
  ): Promise<ClassRecord> {
    await this.assets.restoreBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(
      scope.tx,
      await this.requireClass(scope.tx, params.found.characterClass.id),
    );
  }

  /**
   * The content check of a class at the end of every action that touched it (see
   * `ContentTypeDefinition.verify`): its global code per ruleset and its references, on the state
   * the action leaves behind, so creating, changing rulesets, undoing and restoring all count.
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return;
    }

    const row = found.characterClass;

    await this.assertSystemCodeFree(db, row);
    await this.assertReferencesValid(db, row, parseClassDefinition(row));
  }


  // ---------------------------------------------------------------------------
  // Rules that need the database
  // ---------------------------------------------------------------------------

  /**
   * Global classes share codes across rulesets (2014 and 2024 barbarian), but two active global
   * classes with the same code must not both be available for one ruleset; a neutral class is
   * available for all of them. Custom classes are kept unique per campaign by an index.
   */
  async assertSystemCodeFree(
    db: AppDatabase,
    row: Pick<ClassRow, "assetId" | "campaignId" | "code"> & { id: string | null },
  ): Promise<void> {
    if (row.campaignId !== null) {
      return;
    }

    await this.repository.lockSystemCode(db, row.code);

    const others = (
      await this.repository.listSystemByCode(db, {
        code: row.code,
        exceptClassId: row.id ?? "00000000-0000-0000-0000-000000000000",
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
        throw new ConflictError("Class code is already used for one of these rulesets", {
          code: row.code,
          assetId: asset.id,
        });
      }
    }
  }

  /**
   * Checks the assets a definition refers to and the bindings of granted features. Missing assets
   * and assets of other campaigns are 404; wrong types, unavailable or incompatible assets and
   * bindings that do not fit the feature are 409, with all issues.
   */
  async assertReferencesValid(
    db: AppDatabase,
    row: Pick<ClassRow, "assetId" | "campaignId">,
    definition: ClassDefinition,
  ): Promise<void> {
    const { missing, issues } = await this.collectReferenceIssues(db, row, definition);

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError("Class definition refers to unavailable assets", { issues });
    }
  }

  /** Every issue of a stored definition, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, found: ClassWithAsset): Promise<DefinitionIssue[]> {
    let definition: ClassDefinition;

    try {
      definition = parseClassDefinition(found.characterClass);
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
      issues.push({ path: ["status"], message: "The class is archived" });
    }

    try {
      await this.assertSystemCodeFree(db, found.characterClass);
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      issues.push({ path: ["code"], message: error.message });
    }

    const result = await this.collectReferenceIssues(db, found.characterClass, definition);

    return [...issues, ...result.missing, ...result.issues];
  }

  private async collectReferenceIssues(
    db: AppDatabase,
    row: Pick<ClassRow, "assetId" | "campaignId">,
    definition: ClassDefinition,
  ): Promise<{ missing: DefinitionIssue[]; issues: DefinitionIssue[] }> {
    const bindingIssues: DefinitionIssue[] = [];
    const references: AssetReference[] = [...collectClassReferences(definition)];
    const grants = listGrants(definition);
    const parameters = await this.features.listParameters(
      db,
      grants.map(({ grant }) => grant.featureAssetId),
    );
    const tracks = new Map(definition.progressionTracks.map((track) => [track.key, track]));

    for (const { grant, levelIndex, grantIndex } of grants) {
      const featureParameters = parameters.get(grant.featureAssetId);
      const path = ["levels", levelIndex, "featureGrants", grantIndex];

      if (!featureParameters) {
        // Not a feature (or no feature row); the reference check reports it.
        continue;
      }

      const bound = new Set(grant.bindings.map((binding) => binding.parameterKey));

      for (const parameter of featureParameters) {
        if (parameter.required && parameter.defaultValue === null && !bound.has(parameter.key)) {
          bindingIssues.push({
            path: [...path, "bindings"],
            message: `Required parameter '${parameter.key}' is not bound`,
          });
        }
      }

      grant.bindings.forEach((binding, bindingIndex) => {
        const bindingPath = [...path, "bindings", bindingIndex];
        const parameter = featureParameters.find((item) => item.key === binding.parameterKey);
        const report = (message: string) => bindingIssues.push({ path: bindingPath, message });

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
          case "PROGRESSION_TRACK": {
            const track = tracks.get(binding.trackKey ?? "");

            if (track && !TRACK_PARAMETER_TYPES[track.valueType]?.includes(parameter.valueType)) {
              report(`A ${track.valueType} track cannot fill a ${parameter.valueType} parameter`);
            }

            break;
          }
          case "CLASS_CHOICE":
            if (parameter.valueType !== "TEXT" && parameter.valueType !== "ASSET_REF") {
              report(`A choice cannot fill a ${parameter.valueType} parameter`);
            }

            break;
          case "CONTEXT":
            if (parameter.valueType !== "INTEGER" && parameter.valueType !== "DECIMAL") {
              report(`A context value cannot fill a ${parameter.valueType} parameter`);
            }

            break;
        }
      });
    }

    const campaignRulesetId =
      row.campaignId === null ? null : await this.campaignAccess.findRulesetId(row.campaignId, db);
    const result = await this.assets.collectReferenceIssues(
      db,
      { assetId: row.assetId, campaignId: row.campaignId, campaignRulesetId },
      references,
    );

    return { missing: result.missing, issues: [...result.issues, ...bindingIssues] };
  }

  /**
   * Bound values that may be asset ids; ids of any type, so they are hidden like references. Free
   * text is left out, because it is no asset and must not reach a uuid column.
   */
  private staticAssetValues(definition: ClassDefinition): string[] {
    return listGrants(definition).flatMap(({ grant }) =>
      grant.bindings.flatMap((binding) =>
        binding.bindingSource === "STATIC" &&
        typeof binding.staticValue === "string" &&
        UUID_PATTERN.test(binding.staticValue)
          ? [binding.staticValue]
          : [],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Usages
  // ---------------------------------------------------------------------------

  /** Classes whose definitions refer to the asset, as typed usages for asset-links. */
  async listUsages(
    input: { assetId: string; campaignId: string | null; includeArchived: boolean },
    db: AppDatabase,
  ): Promise<AssetUsageItemDto[]> {
    const rows = await this.repository.listReferencing(db, input);

    return rows.map(({ characterClass, asset }) => ({
      id: characterClass.id,
      type: "CLASS_DEFINITION",
      label: asset.title,
      assetId: asset.id,
      assetType: "CLASS",
      editRoute:
        characterClass.campaignId === null
          ? `/classes/${characterClass.id}`
          : `/campaigns/${characterClass.campaignId}/classes/${characterClass.id}`,
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
        throw new ConflictError("Class code is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The class violates a database constraint");
      }

      throw error;
    }
  }
}
