import type { ContentReadPurpose } from "#core/content/access";
import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { type AssetLinksService, editRoutePrefix } from "#src/modules/asset-links/index";
import {
  type AssetRow,
  type AssetsService,
  type ContentAccess,
  type ContentReference,
  slugify,
} from "#src/modules/assets/index";
import {
  boundAssetIds,
  type ClassDefinition,
  type ClassesService,
  type ClassWithAsset,
  type DefinitionIssue,
  parseClassDefinition,
} from "#src/modules/classes/index";
import type { FeaturesService } from "#src/modules/features/index";
import type { CreateSubclassDto } from "#src/modules/subclasses/domain/dto/CreateSubclassDto";
import type { SubclassDefinition } from "#src/modules/subclasses/domain/dto/SubclassDefinitionDto";
import type { UpdateSubclassDto } from "#src/modules/subclasses/domain/dto/UpdateSubclassDto";
import {
  collectSubclassReferences,
  grantPath,
  listSubclassGrants,
  validateSubclassAgainstClass,
} from "#src/modules/subclasses/domain/SubclassDefinition";
import { grantKeysUpTo, toPlayerSubclassDefinition } from "#src/modules/subclasses/domain/SubclassViews";
import type {
  SubclassRecord,
  SubclassRow,
  SubclassesRepository,
  SubclassWithAsset,
} from "#src/modules/subclasses/domain/repository/SubclassesRepository";
import {
  createTrackedSubclass,
  parseSubclassDefinition,
  SUBCLASS_DEFINITION_GROUP,
  type TrackedSubclass,
} from "#src/modules/subclasses/history/TrackedSubclass";

/** Campaign facts the module needs; provided by the campaigns module. */
export type SubclassCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
  findRulesetId(campaignId: string, db: AppDatabase): Promise<string | null>;
};

/** Kind of the reference from a subclass to its class; usages show it as `SUBCLASS_BASE_CLASS`. */
export const BASE_CLASS_REFERENCE_KIND = "BASE_CLASS";

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

/** A class as its subclasses are checked against it; caches what several subclasses share. */
type ClassCheck = {
  base: ClassWithAsset;
  /** Null if the stored class definition no longer parses. */
  definition: ClassDefinition | null;
  /** Null for a neutral class. */
  rulesets: readonly string[] | null;
  campaignRulesets: Map<string, string | null>;
  /** Whether the class fits a campaign ruleset, by ruleset id. */
  compatible: Map<string, boolean>;
};

/** Why a class assignment can't take a subclass; see `validateSelection`. */
export type SubclassSelectionIssue = { code: string; message: string };

export type SubclassSelectionInput = {
  subclassId: string;
  /** The class of the assignment that takes the subclass. */
  classId: string;
  classLevel: number;
  /** The subclass the assignment already has, if any. */
  currentSubclassId: string | null;
};

export type SubclassSelectionResult = {
  found: SubclassWithAsset;
  definition: SubclassDefinition;
  valid: boolean;
  issues: SubclassSelectionIssue[];
  grantKeys: string[];
};

/**
 * Subclass definitions: global ones, maintained by administrators for global classes, and custom
 * ones of a campaign, for its own classes or for global ones. Each subclass is an asset of type
 * `SUBCLASS` that names its class; the level it is chosen at and the maximum level come from the
 * class. The rules against the class run at the end of every action that changes the subclass,
 * and, because the reference to the class is `dependent`, of every action that changes the class.
 */
export class SubclassesService {
  public readonly trackedSubclass: TrackedSubclass;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: SubclassesRepository,
    private readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    private readonly features: FeaturesService,
    private readonly classes: ClassesService,
    private readonly campaignAccess: SubclassCampaignAccessPort,
  ) {
    this.trackedSubclass = createTrackedSubclass({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (row, tx) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived subclasses cannot be modified", { assetId: asset.id });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireSubclass(db: AppDatabase, subclassId: string): Promise<SubclassWithAsset> {
    const found = await this.repository.findById(db, subclassId);

    if (!found) {
      throw new NotFoundError("Subclass not found");
    }

    return found;
  }

  /** A subclass of a write route: a custom one of the campaign, or a global one without it. */
  async requireForWrite(
    db: AppDatabase,
    path: { campaignId: string | null; subclassId: string },
  ): Promise<SubclassWithAsset> {
    const found = await this.requireSubclass(db, path.subclassId);

    if (found.subclass.campaignId !== path.campaignId) {
      throw new NotFoundError("Subclass not found");
    }

    return found;
  }

  /** A global subclass; custom subclasses are 404 here. */
  async requireSystemSubclass(db: AppDatabase, subclassId: string): Promise<SubclassWithAsset> {
    return this.requireForWrite(db, { campaignId: null, subclassId });
  }

  /**
   * A subclass of the campaign the viewer may read for this purpose: `MANAGE` for the routes of the
   * campaign's own subclasses, `CATALOG` for what the campaign may choose. Players also need to
   * see its class; a subclass of a class they can't choose is of no use to them.
   */
  async requireReadableSubclass(
    access: ContentAccess,
    subclassId: string,
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<SubclassWithAsset> {
    const found = await this.requireSubclass(db, subclassId);

    await access.require(purpose, found.asset, "Subclass not found");

    if (!access.isFullView) {
      const classAsset = await this.assets.requireAsset(db, found.base.classAssetId);

      await access.require(purpose === "MANAGE" ? "READ" : purpose, classAsset, "Subclass not found");
    }

    return found;
  }

  /** For players: only subclasses whose class they may read for the purpose (see above). */
  async filterByReadableClass(
    access: ContentAccess,
    items: readonly SubclassWithAsset[],
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<SubclassWithAsset[]> {
    if (access.isFullView) {
      return [...items];
    }

    const classAssets = [
      ...(await this.assets.findMany(items.map(({ base }) => base.classAssetId), db)).values(),
    ];
    const readable = await access.readableIds(
      purpose === "MANAGE" ? "READ" : purpose,
      classAssets,
      db,
    );

    return items.filter(({ base }) => readable.has(base.classAssetId));
  }

  /**
   * Subclasses of a class the viewer may read in the campaign for this purpose. Callers inside a
   * transaction pass its handle as `db`.
   */
  async listReadableForClass(
    access: ContentAccess,
    classId: string,
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<SubclassWithAsset[]> {
    const items = await this.repository.listForClass(db, classId);
    const readable = await access.readableIds(
      purpose,
      items.map(({ asset }) => asset),
      db,
    );

    return items.filter(({ asset }) => readable.has(asset.id));
  }

  async loadRecord(db: AppDatabase, found: SubclassWithAsset): Promise<SubclassRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as SubclassRecord;
  }

  async loadRecords(db: AppDatabase, items: readonly SubclassWithAsset[]): Promise<SubclassRecord[]> {
    const rulesetIds = await this.assets.repository.listRulesetIds(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  /**
   * The definition as the viewer may see it: unchanged for the full view, stripped of references to
   * assets a player may not see otherwise. Without access (outside a campaign) only active global
   * assets count.
   */
  async definitionFor(
    found: SubclassWithAsset,
    access: ContentAccess | null,
    db: AppDatabase = this.db,
  ): Promise<SubclassDefinition> {
    const definition = parseSubclassDefinition(found.subclass);

    if (access?.isFullView) {
      return definition;
    }

    const ids = [
      ...collectSubclassReferences(definition).map((item) => item.assetId),
      ...boundAssetIds(listSubclassGrants(definition).map(({ grant }) => grant)),
    ];

    return toPlayerSubclassDefinition(
      definition,
      await this.assets.referenceVisibility(access, ids, db),
    );
  }

  /**
   * Custom features, spells and spell lists a released subclass refers to. Players of the campaign
   * may see them through the subclass; global ones are visible anyway. Read without parsing the
   * definitions: this runs for every player request in every module, so one stored definition
   * that no longer parses must not break it.
   */
  async listReleasedContentIds(input: { campaignId: string }, db: AppDatabase): Promise<string[]> {
    const ids = await this.repository.listReleasedReferencedIds(db, input.campaignId);
    const found = await this.assets.findMany(ids, db);

    return [...found.values()]
      .filter(
        (asset) =>
          ["FEATURE", "SPELL", "SPELL_LIST"].includes(asset.assetType) &&
          asset.campaignId === input.campaignId,
      )
      .map((asset) => asset.id);
  }

  /** Edit routes for asset-links, for all custom subclasses of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, { subclass }]) => subclass.campaignId === input.campaignId)
        .map(([assetId, { subclass }]) => [
          assetId,
          `${editRoutePrefix(input.campaignId)}/subclasses/${subclass.id}`,
        ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Selection by actor progression
  // ---------------------------------------------------------------------------

  /**
   * Whether a class assignment of a character may take the subclass, with every reason it can't:
   * the subclass belongs to another class, the class level is below the selection level or above
   * the maximum level of the class, the assignment already has another subclass (one per
   * assignment; a character with several classes may have one per class), or the subclass or class
   * can't be chosen anymore. Subclasses the viewer may not see are 404. Stores nothing; the actor
   * progression stores the choice on the assignment.
   */
  async validateSelection(
    access: ContentAccess,
    input: SubclassSelectionInput,
    db: AppDatabase = this.db,
  ): Promise<SubclassSelectionResult> {
    const found = await this.requireReadableSubclass(access, input.subclassId, "CATALOG", db);
    const definition = await this.definitionFor(found, access, db);
    const classAsset = await this.assets.requireAsset(db, found.base.classAssetId);
    const issues: SubclassSelectionIssue[] = [];
    const add = (code: string, message: string) => issues.push({ code, message });

    if (found.subclass.classId !== input.classId) {
      add("WRONG_CLASS", "The subclass belongs to another class");
    }

    if (input.classLevel < found.base.selectionLevel) {
      add(
        "CLASS_LEVEL_TOO_LOW",
        `The subclass is chosen at class level ${found.base.selectionLevel}`,
      );
    }

    if (input.classLevel > found.base.maximumLevel) {
      add("CLASS_LEVEL_TOO_HIGH", `The class has no level above ${found.base.maximumLevel}`);
    }

    if (input.currentSubclassId !== null && input.currentSubclassId !== found.subclass.id) {
      add("SUBCLASS_ALREADY_CHOSEN", "The class assignment already has a subclass");
    }

    if (found.asset.status !== "ACTIVE") {
      add("SUBCLASS_NOT_SELECTABLE", "Only active subclasses can be chosen");
    }

    if (classAsset.status !== "ACTIVE") {
      add("CLASS_NOT_SELECTABLE", "Only subclasses of active classes can be chosen");
    }

    return {
      found,
      definition,
      valid: issues.length === 0,
      issues,
      grantKeys:
        input.classLevel >= found.base.selectionLevel && input.classLevel <= found.base.maximumLevel
          ? grantKeysUpTo(definition, input.classLevel)
          : [],
    };
  }

  /** For actor progression: the subclass if the assignment may take it, else 409 with the issues. */
  async requireSelectableSubclass(
    access: ContentAccess,
    input: SubclassSelectionInput,
    db: AppDatabase = this.db,
  ): Promise<SubclassSelectionResult> {
    const result = await this.validateSelection(access, input, db);

    if (!result.valid) {
      throw new ConflictError("The subclass cannot be chosen", {
        subclassId: input.subclassId,
        issues: result.issues,
      });
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global subclasses are changed by administrators only; custom subclasses by GMs, editors and
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

  /**
   * Asset and subclass in the transaction of the action; any failure undoes both. The class must be
   * one the scope may build on: a global one, or for custom subclasses one of the campaign. Without
   * a ruleset policy the subclass takes that of its class (global ones also its rulesets), so it is
   * offered wherever the class is.
   */
  async createSubclass(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateSubclassDto,
  ): Promise<SubclassRecord> {
    const base = await this.requireClassFor(scope.tx, params.campaignId, input.classId);

    if (base.asset.status === "ARCHIVED") {
      throw new ConflictError("Archived classes get no new subclasses", { classId: input.classId });
    }

    const inherit = input.rulesetPolicy === undefined;
    const classRulesets =
      inherit && params.campaignId === null && base.asset.rulesetPolicy === "RESTRICTED"
        ? ((await this.assets.ownRulesets(scope.tx, base.asset.id)) ?? [])
        : undefined;
    const rulesetIds = input.rulesetIds ?? classRulesets;
    const code =
      input.code ?? slugify(input.name, { fallback: "subclass" }).slice(0, 100).replace(/-+$/, "");
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "SUBCLASS",
        title: input.name,
        // Codes are unique per class, names may repeat.
        slug: slugify(input.name, { unique: true, fallback: "subclass" }),
        summary: input.summary ?? null,
        status: input.status,
        releasedToPlayers: input.releasedToPlayers,
        rulesetPolicy: input.rulesetPolicy ?? base.asset.rulesetPolicy,
        ...(rulesetIds !== undefined ? { rulesetIds } : {}),
        ...(input.assetFamilyId !== undefined ? { assetFamilyId: input.assetFamilyId } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      },
    );
    const row = {
      campaignId: params.campaignId,
      assetId: asset.id,
      classId: base.characterClass.id,
      code,
      description: input.description ?? null,
      displayOrder: input.displayOrder,
      levels: input.levels,
      progressionTracks: input.progressionTracks,
      choices: input.choices,
      spellcasting: input.spellcasting,
      spellGrants: input.spellGrants,
    };

    const created = await this.withConstraintErrors(() =>
      scope.create(this.trackedSubclass, row),
    );

    return this.loadRecord(scope.tx, await this.requireSubclass(scope.tx, created.id));
  }

  /**
   * Asset fields first, then the subclass. `merged` names the fields of both that kept a newer
   * value from somebody else.
   */
  async updateSubclass(
    scope: ActionScope,
    params: { found: SubclassWithAsset; actorId: string; command: UpdateSubclassDto },
  ): Promise<{ record: SubclassRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command;
    const { subclass, asset } = params.found;
    const merged: string[] = [];

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived subclasses cannot be modified", { assetId: asset.id });
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
        scope.change(this.trackedSubclass, subclass.id, async (current) => ({
          set: await this.withBaseDefinition(scope, current, set, expectedVersion),
          baseVersion: expectedVersion,
        })),
      );

      merged.push(...result.merged);
    }

    const found = await this.requireSubclass(scope.tx, subclass.id);

    return { record: await this.loadRecord(scope.tx, found), merged };
  }

  /**
   * The history compares only the fields that were sent; unsent definition parts are added with
   * their value at the client's base version, so a concurrent change to any of them is a conflict
   * instead of a mix of two versions (like classes).
   */
  private async withBaseDefinition(
    scope: ActionScope,
    current: SubclassRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const group: readonly string[] = SUBCLASS_DEFINITION_GROUP;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => group.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of SUBCLASS_DEFINITION_GROUP) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedSubclass, current.id, part, baseVersion);

        if (stored.known) {
          completed[part] = stored.value;
        }
      }
    }

    return completed;
  }

  /** Archives the asset; fails while other content still refers to it. */
  async archiveSubclass(
    scope: ActionScope,
    params: { found: SubclassWithAsset; expectedAssetVersion: number },
  ): Promise<SubclassRecord> {
    await this.assets.archiveBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireSubclass(scope.tx, params.found.subclass.id));
  }

  /** The class must not be archived; checked by `verifyContent` at the end of the action. */
  async restoreSubclass(
    scope: ActionScope,
    params: { found: SubclassWithAsset; expectedAssetVersion: number },
  ): Promise<SubclassRecord> {
    await this.assets.restoreBase(scope, {
      assetId: params.found.asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireSubclass(scope.tx, params.found.subclass.id));
  }

  // ---------------------------------------------------------------------------
  // Content kernel
  // ---------------------------------------------------------------------------

  /**
   * What the stored subclass refers to, for the reference index: its class (dependent, so the
   * kernel verifies the subclass again whenever the class changes), the referenced assets and the
   * bound values that are asset ids. Null if the definition no longer parses.
   */
  async listContentReferences(asset: AssetRow, db: AppDatabase): Promise<ContentReference[] | null> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return [];
    }

    let definition: SubclassDefinition;

    try {
      definition = parseSubclassDefinition(found.subclass);
    } catch {
      // Unknown for now; the stored references stay.
      return null;
    }

    const bound = await this.features.collectBoundAssetReferences(
      db,
      listSubclassGrants(definition).map((located) => ({
        ...located.grant,
        path: grantPath(located),
      })),
    );

    return [
      {
        assetId: found.base.classAssetId,
        path: ["classId"],
        kind: BASE_CLASS_REFERENCE_KIND,
        dependent: true,
      },
      ...[...collectSubclassReferences(definition), ...bound].map((reference) => ({
        assetId: reference.assetId,
        path: reference.path,
        kind: "DEFINITION",
      })),
    ];
  }

  /**
   * The content check of a subclass at the end of every action that touched it or its class (see
   * `ContentTypeDefinition.verify`), on the state the action leaves behind: the class (scope,
   * status, rulesets), the rules against it, the references and the bindings of granted features.
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return;
    }

    const result = await this.collectIssues(db, found, { lock: true });
    const subject = { subclassId: found.subclass.id, assetId: asset.id, name: asset.title };

    if (result.classMissing.length > 0) {
      throw new NotFoundError("Class of the subclass not found", { ...subject, issues: result.classMissing });
    }

    if (result.classIssues.length > 0) {
      throw new ConflictError(`The subclass '${asset.title}' does not fit its class`, {
        ...subject,
        issues: result.classIssues,
      });
    }

    if (result.missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { ...subject, issues: result.missing });
    }

    if (result.issues.length > 0) {
      throw new ConflictError(`The subclass '${asset.title}' refers to unavailable assets`, {
        ...subject,
        issues: result.issues,
      });
    }
  }

  /** Every issue of a stored subclass, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, found: SubclassWithAsset): Promise<DefinitionIssue[]> {
    try {
      parseSubclassDefinition(found.subclass);
    } catch (error) {
      if (error instanceof ValidationError) {
        return issuesOf(error);
      }

      throw error;
    }

    const issues: DefinitionIssue[] = [];

    if (found.asset.status === "ARCHIVED") {
      issues.push({ path: ["status"], message: "The subclass is archived" });
    }

    const result = await this.collectIssues(db, found, { lock: false });

    return [
      ...issues,
      ...result.classMissing,
      ...result.classIssues,
      ...result.missing,
      ...result.issues,
    ];
  }

  // ---------------------------------------------------------------------------
  // Rules that need the database
  // ---------------------------------------------------------------------------

  /**
   * Every issue of a subclass, by category. With `lock` (writes) the class is locked first (see
   * `ClassesService.lockForDependent`), so it can't change or be archived until the action
   * commits; read-only checks (`validate`) pass `lock: false`, where a lock protects nothing.
   */
  private async collectIssues(
    db: AppDatabase,
    found: SubclassWithAsset,
    options: { lock: boolean },
  ): Promise<{
    classMissing: DefinitionIssue[];
    classIssues: DefinitionIssue[];
    missing: DefinitionIssue[];
    issues: DefinitionIssue[];
  }> {
    const { subclass } = found;
    const empty = { classMissing: [], classIssues: [], missing: [], issues: [] };
    const base = options.lock
      ? await this.classes.lockForDependent(db, subclass.classId)
      : await this.classes.repository.findById(db, subclass.classId);
    const definition = parseSubclassDefinition(subclass);

    if (!base || !this.mayBuildOn(subclass.campaignId, base)) {
      return { ...empty, classMissing: [{ path: ["classId"], message: "Class not found" }] };
    }

    const check = await this.loadClassCheck(db, base);
    const classIssues = await this.classIssuesOf(
      db,
      found,
      definition,
      check,
      await this.assets.ownRulesets(db, found.asset.id),
    );
    const campaignRulesetId =
      subclass.campaignId === null ? null : await this.campaignRulesetOf(db, check, subclass.campaignId);
    const bindings = await this.classes.collectGrantBindingIssues(
      db,
      listSubclassGrants(definition).map((located) => ({
        grant: located.grant,
        path: grantPath(located),
      })),
      definition.progressionTracks,
    );
    const result = await this.assets.collectReferenceIssues(
      db,
      { assetId: subclass.assetId, campaignId: subclass.campaignId, campaignRulesetId },
      [...collectSubclassReferences(definition), ...bindings.references],
    );

    return {
      classMissing: [],
      classIssues,
      missing: result.missing,
      issues: [...result.issues, ...bindings.issues],
    };
  }

  /**
   * The check of subclasses whose class an action changed (`ContentTypeDefinition.verifyDependents`):
   * only the rules against the class, so a latent issue of one subclass elsewhere (a binding that
   * broke when a feature changed) can't block a change to the class that has nothing to do with it.
   * Each class is locked and read once for all of its subclasses. Throws one 409 naming every
   * subclass that would no longer fit.
   */
  async verifyDependents(sources: readonly AssetRow[], db: AppDatabase): Promise<void> {
    const found = [...(await this.repository.findByAssetIds(db, sources.map((asset) => asset.id))).values()];
    const byClass = new Map<string, SubclassWithAsset[]>();

    for (const item of found) {
      byClass.set(item.subclass.classId, [...(byClass.get(item.subclass.classId) ?? []), item]);
    }

    const rulesets = await this.assets.repository.listRulesetIds(
      db,
      found.map(({ asset }) => asset.id),
    );
    const failures: { subclassId: string; assetId: string; name: string; issues: DefinitionIssue[] }[] = [];

    // Sorted, so concurrent actions lock the classes in the same order.
    for (const classId of [...byClass.keys()].sort()) {
      const base = await this.classes.lockForDependent(db, classId);

      if (!base) {
        continue;
      }

      const check = await this.loadClassCheck(db, base);

      for (const item of byClass.get(classId) ?? []) {
        let definition: SubclassDefinition;

        try {
          definition = parseSubclassDefinition(item.subclass);
        } catch {
          // Broken before this action; `validate` reports it, the class change didn't cause it.
          continue;
        }

        const own = item.asset.rulesetPolicy === "NEUTRAL" ? null : (rulesets.get(item.asset.id) ?? []);
        const issues = await this.classIssuesOf(db, item, definition, check, own);

        if (issues.length > 0) {
          failures.push({
            subclassId: item.subclass.id,
            assetId: item.asset.id,
            name: item.asset.title,
            issues,
          });
        }
      }
    }

    if (failures.length > 0) {
      throw new ConflictError(
        `Subclasses would no longer fit their class: ${failures.map((item) => `'${item.name}'`).join(", ")}`,
        { subclasses: failures },
      );
    }
  }

  /** What every subclass of one class is checked against, read once per action. */
  private async loadClassCheck(db: AppDatabase, base: ClassWithAsset): Promise<ClassCheck> {
    let definition: ClassDefinition | null = null;

    try {
      definition = parseClassDefinition(base.characterClass);
    } catch {
      // Reported as an issue of each subclass.
    }

    return {
      base,
      definition,
      rulesets: await this.assets.ownRulesets(db, base.asset.id),
      campaignRulesets: new Map(),
      compatible: new Map(),
    };
  }

  private async campaignRulesetOf(
    db: AppDatabase,
    check: ClassCheck,
    campaignId: string,
  ): Promise<string | null> {
    if (!check.campaignRulesets.has(campaignId)) {
      check.campaignRulesets.set(campaignId, await this.campaignAccess.findRulesetId(campaignId, db));
    }

    return check.campaignRulesets.get(campaignId) ?? null;
  }

  /**
   * The rules of a subclass against its class: archived classes keep nothing alive, an active
   * global subclass needs an active global class covering its rulesets, a custom one an active
   * global class for the campaign ruleset or a class of its campaign; then the level range,
   * upgrade targets and spellcasting (`validateSubclassAgainstClass`).
   */
  private async classIssuesOf(
    db: AppDatabase,
    found: SubclassWithAsset,
    definition: SubclassDefinition,
    check: ClassCheck,
    ownRulesets: readonly string[] | null,
  ): Promise<DefinitionIssue[]> {
    const issues: DefinitionIssue[] = [];
    const add = (message: string) => issues.push({ path: ["classId"], message });
    const { base } = check;
    const classAsset = base.asset;

    if (classAsset.status === "ARCHIVED") {
      add("The class is archived");
      return issues;
    }

    if (found.subclass.campaignId === null) {
      if (found.asset.status === "ACTIVE" && classAsset.status !== "ACTIVE") {
        add("An active global subclass needs an active class");
      }

      const classRulesets = check.rulesets;

      if (
        classRulesets !== null &&
        (ownRulesets === null || ownRulesets.some((id) => !classRulesets.includes(id)))
      ) {
        add("The class is not available for all rulesets of the subclass");
      }
    } else if (classAsset.scope === "SYSTEM") {
      const campaignRulesetId = await this.campaignRulesetOf(db, check, found.subclass.campaignId);

      if (classAsset.status !== "ACTIVE") {
        add("Custom subclasses need an active global class");
      } else if (campaignRulesetId !== null) {
        if (!check.compatible.has(campaignRulesetId)) {
          check.compatible.set(
            campaignRulesetId,
            await this.assets.repository.isCompatible(db, classAsset.id, campaignRulesetId),
          );
        }

        if (!check.compatible.get(campaignRulesetId)) {
          add("The class is not available for the campaign ruleset");
        }
      }
    }

    if (check.definition === null) {
      add("The definition of the class is invalid");
    } else {
      issues.push(
        ...validateSubclassAgainstClass(
          {
            maximumLevel: base.characterClass.maximumLevel,
            subclassSelectionLevel: base.characterClass.subclassSelectionLevel,
            definition: check.definition,
          },
          definition,
        ),
      );
    }

    return issues;
  }

  /** Global subclasses build on global classes; custom ones on global classes or their campaign's. */
  private mayBuildOn(campaignId: string | null, base: ClassWithAsset): boolean {
    const classCampaignId = base.characterClass.campaignId;

    return classCampaignId === null || (campaignId !== null && classCampaignId === campaignId);
  }

  /** The class of a new subclass; classes the scope may not build on are 404. */
  private async requireClassFor(
    db: AppDatabase,
    campaignId: string | null,
    classId: string,
  ): Promise<ClassWithAsset> {
    const base = await this.classes.repository.findById(db, classId);

    if (!base || !this.mayBuildOn(campaignId, base)) {
      throw new NotFoundError("Class not found");
    }

    // A draft global class isn't offered to campaigns, so it isn't there for their subclasses.
    if (campaignId !== null && base.asset.scope === "SYSTEM" && base.asset.status !== "ACTIVE") {
      throw new NotFoundError("Class not found");
    }

    return base;
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
        throw new ConflictError("Subclass code is already in use for this class");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign, class or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The subclass violates a database constraint");
      }

      throw error;
    }
  }
}

function issuesOf(error: ValidationError): DefinitionIssue[] {
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
