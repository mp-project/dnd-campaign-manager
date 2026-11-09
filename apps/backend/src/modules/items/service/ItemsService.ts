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
  type ContentReference,
  slugify,
} from "#src/modules/assets/index";
import {
  type ActorSnapshot,
  checkTypedValue,
  type FeaturesService,
  toResolvedFeatureResponse,
} from "#src/modules/features/index";
import { columnsOfCreate, type CreateItemDto, type ForkItemDto } from "#src/modules/items/domain/dto/CreateItemDto";
import type { ItemDefinitionParts, ItemFeatureGrant } from "#src/modules/items/domain/dto/ItemDefinitionDto";
import type { UpdateItemDto } from "#src/modules/items/domain/dto/UpdateItemDto";
import {
  collectGrantReferences,
  collectSpellReferences,
  type DefinitionIssue,
} from "#src/modules/items/domain/ItemDefinition";
import { contextValuesOf, type ItemResolveInput, resolveItem } from "#src/modules/items/domain/ItemResolution";
import {
  type ItemRecord,
  type ItemRow,
  type ItemsRepository,
  type ItemWithAsset,
  lockSystemCode,
} from "#src/modules/items/domain/repository/ItemsRepository";
import {
  createTrackedItem,
  ITEM_DEFINITION_GROUP,
  parseItemDefinition,
  type TrackedItem,
  tryParseItemDefinition,
} from "#src/modules/items/history/TrackedItem";
import type { SpellsService } from "#src/modules/spells/index";

/** Campaign facts the module needs; provided by the campaigns module. */
export type ItemCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
  findRulesetId(campaignId: string, db: AppDatabase): Promise<string | null>;
};

/** Fields of the asset that items show as their own; `name` is its title. */
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

/** Columns a fork copies: everything but identity, audit and the campaign. */
const NOT_COPIED = new Set([
  "id",
  "version",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "createdBy",
  "updatedBy",
  "campaignId",
  "assetId",
  "code",
  "forkedFromAssetId",
]);

type KindedReference = AssetReference & { kind: "DEFINITION" | "SPELL" };

/**
 * Item definitions: global ones, maintained by administrators per ruleset and usable by every
 * campaign of a fitting ruleset, and custom ones of a campaign. Each is an asset of type `ITEM`;
 * the asset holds name, summary, status and rulesets, the row the definition. Instances are kept
 * by `ItemInstancesService`.
 */
export class ItemsService {
  public readonly trackedItem: TrackedItem;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: ItemsRepository,
    public readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    private readonly features: FeaturesService,
    private readonly spells: SpellsService,
    private readonly campaignAccess: ItemCampaignAccessPort,
  ) {
    this.trackedItem = createTrackedItem({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (assetId, tx) => {
        const asset = await assets.requireAsset(tx, assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived content cannot be modified", { assetId: asset.id });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireItem(db: AppDatabase, itemId: string): Promise<ItemWithAsset> {
    const found = await this.repository.findById(db, itemId);

    if (!found) {
      throw new NotFoundError("Item not found");
    }

    return found;
  }

  /**
   * The item of a route: with a campaign a custom item of that campaign, without one a global
   * item; everything else is 404.
   */
  async requireScopedItem(db: AppDatabase, path: { campaignId: string | null; itemId: string }): Promise<ItemWithAsset> {
    const found = await this.requireItem(db, path.itemId);

    if (found.item.campaignId !== path.campaignId) {
      throw new NotFoundError("Item not found");
    }

    return found;
  }

  /**
   * An item of the campaign the viewer may read for this purpose (`ContentReadPurpose`). Callers
   * inside a transaction pass its handle as `db`.
   */
  async requireReadableItem(
    access: ContentAccess,
    itemId: string,
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<ItemWithAsset> {
    const found = await this.requireItem(db, itemId);

    await access.require(purpose, found.asset, "Item not found", db);

    return found;
  }

  /** The definition behind an item asset, regardless of its status; null if there is none. */
  async findByAsset(db: AppDatabase, assetId: string): Promise<ItemWithAsset | null> {
    return (await this.repository.findByAssetIds(db, [assetId])).get(assetId) ?? null;
  }

  async loadRecord(db: AppDatabase, found: ItemWithAsset): Promise<ItemRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as ItemRecord;
  }

  async loadRecords(db: AppDatabase, found: readonly ItemWithAsset[]): Promise<ItemRecord[]> {
    const rulesetIds = await this.assets.repository.listRulesetIds(
      db,
      found.map(({ asset }) => asset.id),
    );

    return found.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  /**
   * Which assets the item refers to the viewer may read; used to leave hidden grants and spells
   * out of the player view. Without access (outside a campaign) only active global assets count.
   */
  async playerReferenceVisibility(
    definition: ItemDefinitionParts,
    access: ContentAccess | null,
    db: AppDatabase = this.db,
  ): Promise<(assetId: string) => boolean> {
    return this.playerReferenceVisibilityOf([definition], access, db);
  }

  /** The same for several definitions in one lookup, e.g. for a page of instances. */
  async playerReferenceVisibilityOf(
    definitions: readonly ItemDefinitionParts[],
    access: ContentAccess | null,
    db: AppDatabase = this.db,
  ): Promise<(assetId: string) => boolean> {
    return this.assets.referenceVisibility(
      access,
      definitions.flatMap((definition) =>
        [...collectGrantReferences(definition.featureGrants), ...collectSpellReferences(definition.spells)].map(
          (reference) => reference.assetId,
        ),
      ),
      db,
    );
  }

  /** Edit routes for asset-links, for all custom items of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, entry]) => entry.item.campaignId === input.campaignId)
        .map(([assetId, entry]) => [assetId, `${editRoutePrefix(input.campaignId)}/items/${entry.item.id}`]),
    );
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global items are changed by administrators only; custom items by GMs, editors and
   * administrators of the campaign. Non-members get 404.
   */
  async assertCanWrite(context: RequestContext, campaignId: string | null, db: AppDatabase): Promise<string> {
    return this.assets.assertCanWrite(context, "EDIT", campaignId, db);
  }

  /** Id of the acting user, after `assertCanWrite` checked the rights. */
  actorIdOf(context: RequestContext): string {
    return this.assets.assertAuthenticated(context);
  }

  /** Asset and item in the transaction of the action; any failure undoes both. */
  async createItem(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateItemDto,
  ): Promise<ItemRecord> {
    const {
      name,
      summary,
      status,
      releasedToPlayers,
      sourceReference,
      rulesetPolicy,
      rulesetIds,
      assetFamilyId,
      code,
      ...fields
    } = columnsOfCreate(input);
    const asset = await this.createAsset(scope, params, {
      name,
      summary,
      status,
      releasedToPlayers,
      sourceReference,
      rulesetPolicy,
      rulesetIds,
      assetFamilyId,
    });
    const created = await this.withConstraintErrors(() =>
      scope.create(this.trackedItem, {
        ...fields,
        campaignId: params.campaignId,
        assetId: asset.id,
        code: code ?? codeOf(name),
      }),
    );

    return this.loadRecord(scope.tx, await this.requireItem(scope.tx, created.id));
  }

  /**
   * A custom copy of an item in the campaign: every detail, effect, grant and spell, with a note
   * where it came from. The copy uses the campaign ruleset when the source was restricted, and is
   * checked at the end of the action like every new item (a global source the campaign may use
   * only refers to what the campaign may use as well).
   */
  async forkItem(
    scope: ActionScope,
    params: { actorId: string; campaignId: string; source: ItemWithAsset },
    input: ForkItemDto,
  ): Promise<ItemRecord> {
    const { item: source, asset: sourceAsset } = params.source;
    const name = input.name ?? sourceAsset.title;
    const asset = await this.createAsset(scope, params, {
      name,
      summary: sourceAsset.summary,
      status: input.status,
      releasedToPlayers: false,
      sourceReference: (sourceAsset.sourceReference as Record<string, unknown> | null) ?? undefined,
      rulesetPolicy: sourceAsset.rulesetPolicy,
      rulesetIds: undefined,
      assetFamilyId: undefined,
    });
    const copied = Object.fromEntries(Object.entries(source).filter(([key]) => !NOT_COPIED.has(key)));
    const created = await this.withConstraintErrors(() =>
      scope.create(this.trackedItem, {
        ...copied,
        campaignId: params.campaignId,
        assetId: asset.id,
        code: input.code ?? source.code,
        forkedFromAssetId: sourceAsset.id,
      }),
    );

    return this.loadRecord(scope.tx, await this.requireItem(scope.tx, created.id));
  }

  /**
   * Asset fields first, then the item. `merged` names the fields of both that kept a newer value
   * from somebody else. The rules across rows are checked at the end of the action.
   */
  async updateItem(
    scope: ActionScope,
    params: { found: ItemWithAsset; actorId: string; command: UpdateItemDto },
  ): Promise<{ record: ItemRecord; merged: string[] }> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command as Record<string, unknown> & {
      expectedVersion: number;
      expectedAssetVersion: number;
    };
    const merged: string[] = [];

    if (params.found.asset.status === "ARCHIVED") {
      throw new ConflictError("Archived content cannot be modified", { assetId: params.found.asset.id });
    }

    const assetPatch = Object.fromEntries(
      ASSET_FIELDS.filter((key) => fields[key] !== undefined).map((key) => [key === "name" ? "title" : key, fields[key]]),
    );

    if (Object.keys(assetPatch).length > 0) {
      const result = await this.assets.updateMetadata(scope, {
        assetId: params.found.asset.id,
        expectedVersion: expectedAssetVersion,
        actorId: params.actorId,
        patch: assetPatch,
      });

      merged.push(...result.merged.map((field) => (field === "title" ? "name" : field)));
    }

    const set = Object.fromEntries(
      Object.entries(fields).filter(
        ([key, value]) => value !== undefined && !(ASSET_FIELDS as readonly string[]).includes(key),
      ),
    );

    if (Object.keys(set).length > 0) {
      const result = await this.withConstraintErrors(() =>
        scope.change(this.trackedItem, params.found.item.id, async (current) => ({
          set: await this.withBaseDefinition(scope, current, set, expectedVersion),
          baseVersion: expectedVersion,
        })),
      );

      merged.push(...result.merged);
    }

    return { record: await this.loadRecord(scope.tx, await this.requireItem(scope.tx, params.found.item.id)), merged };
  }

  /** Archives or restores the asset; archiving fails while content or instances still need it. */
  async changeLifecycle(
    scope: ActionScope,
    params: { assetId: string; expectedAssetVersion: number; archive: boolean },
  ): Promise<void> {
    const command = { assetId: params.assetId, expectedVersion: params.expectedAssetVersion };

    if (params.archive) {
      await this.assets.archiveBase(scope, command);
    } else {
      await this.assets.restoreBase(scope, command);
    }
  }

  private async createAsset(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: {
      name: string;
      summary: string | null | undefined;
      status: "DRAFT" | "ACTIVE";
      releasedToPlayers: boolean;
      sourceReference: Record<string, unknown> | null | undefined;
      rulesetPolicy: "NEUTRAL" | "RESTRICTED";
      rulesetIds: string[] | undefined;
      assetFamilyId: string | null | undefined;
    },
  ): Promise<AssetRow> {
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "ITEM",
        title: input.name,
        // Codes are unique per scope and ruleset, names may repeat.
        slug: slugify(input.name, { unique: true, fallback: "item" }),
        summary: input.summary ?? null,
        status: input.status,
        releasedToPlayers: input.releasedToPlayers,
        rulesetPolicy: input.rulesetPolicy,
        ...(input.rulesetIds !== undefined ? { rulesetIds: input.rulesetIds } : {}),
        ...(input.assetFamilyId !== undefined ? { assetFamilyId: input.assetFamilyId } : {}),
        ...(input.sourceReference !== undefined ? { sourceReference: input.sourceReference } : {}),
      },
    );

    return asset;
  }

  /**
   * The history compares only the fields that were sent. A client that changes one field of the
   * definition group sends the others unchanged in its mind, so they are added with their value at
   * its base version: when somebody else changed one of them in the meantime, the group makes that
   * a conflict (412) instead of a mix of two versions. Like `SpellsService`.
   */
  private async withBaseDefinition(
    scope: ActionScope,
    current: ItemRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const group: readonly string[] = ITEM_DEFINITION_GROUP;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => group.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of ITEM_DEFINITION_GROUP) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedItem, current.id, part, baseVersion);

        if (stored.known) {
          completed[part] = stored.value;
        }
      }
    }

    return completed;
  }

  // ---------------------------------------------------------------------------
  // Content kernel
  // ---------------------------------------------------------------------------

  /**
   * What a stored item refers to, for the reference index: granted and targeted features and
   * asset ids bound to their parameters (`DEFINITION`), and the spells it casts (`SPELL`). Null
   * while the definition doesn't parse, so the stored references stay.
   */
  async listContentReferences(asset: AssetRow, db: AppDatabase): Promise<ContentReference[] | null> {
    const found = await this.findByAsset(db, asset.id);

    if (!found) {
      return [];
    }

    const references = await this.collectReferences(db, found.item);

    return references?.map(({ assetId, path, kind }) => ({ assetId, path, kind })) ?? null;
  }

  /**
   * The content check at the end of every action that touched an item (see
   * `ContentTypeDefinition.verify`), on the state the action leaves behind: the definition, the
   * code per ruleset, the referenced features and spells, the bindings of grants and the cast level
   * of spells. Throws the first failing category.
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const found = await this.findByAsset(db, asset.id);

    if (!found) {
      return;
    }

    const definition = parseItemDefinition(found.item);

    await this.assertSystemCodeFree(db, found.item);

    const { missing, issues } = await this.collectDefinitionIssues(db, found.item, definition, { lock: true });

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError("The item refers to unavailable assets", { issues });
    }
  }

  /** Every issue of a stored item, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, found: ItemWithAsset): Promise<DefinitionIssue[]> {
    let definition: ItemDefinitionParts;

    try {
      definition = parseItemDefinition(found.item);
    } catch (error) {
      return issuesOf(error);
    }

    const issues: DefinitionIssue[] = [];

    if (found.asset.status === "ARCHIVED") {
      issues.push({ path: ["status"], message: "The item is archived" });
    }

    try {
      await this.assertSystemCodeFree(db, found.item, { lock: false });
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      issues.push({ path: ["code"], message: error.message });
    }

    const references = await this.collectDefinitionIssues(db, found.item, definition, { lock: false });

    return [...issues, ...references.missing, ...references.issues];
  }

  /** References of the stored item with their kind; null while the definition doesn't parse. */
  private async collectReferences(db: AppDatabase, item: ItemRow): Promise<KindedReference[] | null> {
    const definition = tryParseItemDefinition(item);

    if (definition === null) {
      return null;
    }

    const bound = await this.features.collectBoundAssetReferences(
      db,
      definition.featureGrants.map((grant, grantIndex) => ({ ...grant, path: ["featureGrants", grantIndex] })),
    );

    return [
      ...collectGrantReferences(definition.featureGrants).map((reference) => ({ ...reference, kind: "DEFINITION" as const })),
      ...bound.map((reference) => ({ ...reference, assetTypes: ASSET_TYPES, kind: "DEFINITION" as const })),
      ...collectSpellReferences(definition.spells).map((reference) => ({ ...reference, kind: "SPELL" as const })),
    ];
  }

  /**
   * Missing assets and assets of other campaigns are 404 (`missing`); wrong types, archived or
   * incompatible assets, bindings that don't fit the granted feature and spells cast below their
   * level are 409 (`issues`). A custom item may refer to global content of its ruleset; a global
   * one only to global content that covers all of its rulesets.
   */
  private async collectDefinitionIssues(
    db: AppDatabase,
    item: ItemRow,
    definition: ItemDefinitionParts,
    options: { lock: boolean },
  ): Promise<{ missing: DefinitionIssue[]; issues: DefinitionIssue[] }> {
    const references: AssetReference[] = [
      ...collectGrantReferences(definition.featureGrants),
      ...collectSpellReferences(definition.spells),
    ];
    const bindingIssues = await this.collectBindingIssues(db, definition.featureGrants, references, options);
    const campaignRulesetId =
      item.campaignId === null ? null : await this.campaignAccess.findRulesetId(item.campaignId, db);
    const { missing, issues } = await this.assets.collectReferenceIssues(
      db,
      { assetId: item.assetId, campaignId: item.campaignId, campaignRulesetId },
      references,
    );
    const spellRows = await this.spells.repository.findByAssetIds(
      db,
      definition.spells.map((spell) => spell.spellAssetId),
    );
    const levelIssues = definition.spells.flatMap((spell, index) => {
      const level = spellRows.get(spell.spellAssetId)?.spell.level;

      if (level === undefined) {
        return [];
      }

      if (level === 0 && spell.castAtLevel !== null) {
        return [{ path: ["spells", index, "castAtLevel"], message: "Cantrips are cast without a slot level" }];
      }

      return spell.castAtLevel !== null && spell.castAtLevel < level
        ? [{ path: ["spells", index, "castAtLevel"], message: `The spell is level ${level}; it can't be cast lower` }]
        : [];
    });

    return { missing, issues: [...issues, ...bindingIssues, ...levelIssues] };
  }

  /**
   * Bindings against the parameters of the granted features; bound asset ids are added to
   * `references` so they are checked like the others. With `lock` the features stay share-locked,
   * so a concurrent change of them waits. Like the feats module, without feat choices.
   */
  private async collectBindingIssues(
    db: AppDatabase,
    grants: readonly ItemFeatureGrant[],
    references: AssetReference[],
    options: { lock: boolean },
  ): Promise<DefinitionIssue[]> {
    const issues: DefinitionIssue[] = [];
    const inspected = await this.features.inspectFeatures(
      db,
      grants.flatMap((grant) =>
        grant.targetFeatureAssetId === null ? [grant.featureAssetId] : [grant.featureAssetId, grant.targetFeatureAssetId],
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

  /**
   * Global items share codes across rulesets (2014 and 2024 Longsword), but two active global items
   * with the same code must not both be available for one ruleset; a neutral one is available for
   * all of them. Custom items are kept unique per campaign by an index.
   */
  private async assertSystemCodeFree(db: AppDatabase, item: ItemRow, options: { lock: boolean } = { lock: true }) {
    if (item.campaignId !== null) {
      return;
    }

    if (options.lock) {
      await lockSystemCode(db, item.code);
    }

    const others = (await this.repository.listSystemByCode(db, { code: item.code, exceptItemId: item.id }))
      .map(({ asset }) => asset)
      .filter((asset) => asset.status !== "ARCHIVED" && asset.id !== item.assetId);

    if (others.length === 0) {
      return;
    }

    const own = await this.assets.ownRulesets(db, item.assetId);
    const otherRulesets = await this.assets.repository.listRulesetIds(
      db,
      others.map((asset) => asset.id),
    );

    for (const asset of others) {
      const theirs = asset.rulesetPolicy === "NEUTRAL" ? null : (otherRulesets.get(asset.id) ?? []);
      const overlaps = own === null || theirs === null || own.some((rulesetId) => theirs.includes(rulesetId));

      if (overlaps) {
        throw new ConflictError("The item code is already used for one of these rulesets", {
          code: item.code,
          assetId: asset.id,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Calculation
  // ---------------------------------------------------------------------------

  /**
   * What the item gives an actor in a state (see `resolveItem`), with every active granted feature
   * resolved for the actor. `isVisible` leaves out grants and spells of assets the reader may not
   * see. Nothing is stored or spent. Callers inside a transaction pass its handle as `db`.
   */
  async resolve(
    found: ItemWithAsset,
    input: ItemResolveInput & {
      definition: ItemDefinitionParts;
      access: ContentAccess;
      isVisible: (assetId: string) => boolean;
      db?: AppDatabase | undefined;
    },
  ) {
    const db = input.db ?? this.db;
    const visible = {
      ...input.definition,
      featureGrants: input.definition.featureGrants.filter(
        (grant) =>
          input.isVisible(grant.featureAssetId) &&
          (grant.targetFeatureAssetId === null || input.isVisible(grant.targetFeatureAssetId)),
      ),
      spells: input.definition.spells.filter((spell) => input.isVisible(spell.spellAssetId)),
    };
    const resolved = resolveItem(
      { ...found.item, ...visible, code: found.item.code, assetId: found.asset.id },
      { actor: input.actor, state: input.state, attack: input.attack },
    );
    const grants = new Map(visible.featureGrants.map((grant) => [grant.key, grant]));
    const active = resolved.featureGrants.filter((grant) => grant.active);
    const featureRows = await this.features.repository.findByAssetIds(
      db,
      active.map((grant) => grant.featureAssetId),
    );
    const context = contextValuesOf(input.actor);
    const actor: ActorSnapshot = {
      ...input.actor,
      ...(input.actor.characterLevel !== undefined ? { sourceLevel: input.actor.characterLevel } : {}),
    };
    const featureGrants = [];

    for (const grant of resolved.featureGrants) {
      const stored = grants.get(grant.key) as ItemFeatureGrant;
      const feature = featureRows.get(grant.featureAssetId);

      if (!grant.active || !feature) {
        featureGrants.push({ ...grant, resolved: null });
        continue;
      }

      const parameters: Record<string, unknown> = {};

      for (const binding of stored.bindings) {
        if (binding.bindingSource === "STATIC") {
          parameters[binding.parameterKey] = binding.staticValue;
        } else if (binding.contextKey !== null && context[binding.contextKey] !== undefined) {
          parameters[binding.parameterKey] = context[binding.contextKey];
        }
      }

      const graph = await this.features.resolveFeature(feature, {
        access: input.access,
        bindings: { parameters, choices: {} },
        actor,
        db,
      });

      featureGrants.push({
        ...grant,
        resolved: toResolvedFeatureResponse(feature, input.access.viewer.rulesetId, graph),
      });
    }

    return { ...resolved, featureGrants };
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
        throw new ConflictError("The item code is already in use");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The item violates a database constraint");
      }

      throw error;
    }
  }
}

/** A code from the name, cut to the column length. */
function codeOf(name: string): string {
  return slugify(name, { fallback: "item" }).slice(0, 100).replace(/-+$/, "");
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
