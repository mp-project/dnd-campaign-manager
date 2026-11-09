import type { ContentReadPurpose } from "#core/content/access";
import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError, ValidationError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import type { RequestContext } from "#core/http/requestContext";
import { type AssetLinksService, editRoutePrefix } from "#src/modules/asset-links/index";
import {
  type AssetReference,
  type AssetRow,
  type AssetsService,
  type ContentAccess,
  type ContentReference,
  slugify,
} from "#src/modules/assets/index";
import type { CreateSpellDto, CreateSpellListDto } from "#src/modules/spells/domain/dto/CreateSpellDto";
import {
  type SpellDefinition,
  SpellListEntriesSchema,
} from "#src/modules/spells/domain/dto/SpellDefinitionDto";
import type { UpdateSpellDto, UpdateSpellListDto } from "#src/modules/spells/domain/dto/UpdateSpellDto";
import {
  lockSystemCode,
  type SpellListMembership,
  type SpellListRecord,
  type SpellListsRepository,
  type SpellListWithAsset,
  type SpellRecord,
  type SpellRow,
  type SpellsRepository,
  type SpellWithAsset,
} from "#src/modules/spells/domain/repository/SpellsRepository";
import {
  collectChoiceReferences,
  collectEntryReferences,
  collectListReferences,
  type DefinitionIssue,
} from "#src/modules/spells/domain/SpellDefinition";
import {
  createTrackedSpell,
  createTrackedSpellList,
  parseSpellDefinition,
  SPELL_DEFINITION_GROUP,
  storedSpellIds,
  storedSpellListIds,
  type TrackedSpell,
  type TrackedSpellList,
  tryParseSpellDefinition,
} from "#src/modules/spells/history/TrackedSpell";

/** Campaign facts the module needs; provided by the campaigns module. */
export type SpellCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
  findRulesetId(campaignId: string, db: AppDatabase): Promise<string | null>;
};

/** Fields of the asset that spells and spell lists show as their own; `name` is its title. */
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

type ContentKindName = "spell" | "spell list";

type Owner = { id: string; assetId: string; campaignId: string | null; code: string };

/**
 * Spells and spell lists: global ones, maintained by administrators per ruleset and usable by every
 * campaign of a fitting ruleset, and custom ones of a campaign. Each is an asset (`SPELL`,
 * `SPELL_LIST`); the asset holds name, summary, status and rulesets, the row the definition. A list
 * holds its own entries, and spells may name lists they belong to; in a campaign a list contains
 * both. Slots, prepared spells and concentration are state of actors and not stored here.
 */
export class SpellsService {
  public readonly trackedSpell: TrackedSpell;
  public readonly trackedSpellList: TrackedSpellList;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: SpellsRepository,
    public readonly listRepository: SpellListsRepository,
    public readonly assets: AssetsService,
    private readonly links: AssetLinksService,
    private readonly campaignAccess: SpellCampaignAccessPort,
  ) {
    const deps = {
      resolveRole: async (campaignId: string, actorId: string, tx: AppDatabase) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (assetId: string, tx: AppDatabase) => {
        const asset = await assets.requireAsset(tx, assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived content cannot be modified", { assetId: asset.id });
        }
      },
    };

    this.trackedSpell = createTrackedSpell(deps);
    this.trackedSpellList = createTrackedSpellList(deps);
  }

  // ---------------------------------------------------------------------------
  // Reading spells
  // ---------------------------------------------------------------------------

  async requireSpell(db: AppDatabase, spellId: string): Promise<SpellWithAsset> {
    const found = await this.repository.findById(db, spellId);

    if (!found) {
      throw new NotFoundError("Spell not found");
    }

    return found;
  }

  /**
   * The spell of a route: with a campaign a custom spell of that campaign, without one a global
   * spell; everything else is 404.
   */
  async requireScopedSpell(
    db: AppDatabase,
    path: { campaignId: string | null; spellId: string },
  ): Promise<SpellWithAsset> {
    const found = await this.requireSpell(db, path.spellId);

    if (found.spell.campaignId !== path.campaignId) {
      throw new NotFoundError("Spell not found");
    }

    return found;
  }

  /**
   * A spell of the campaign the viewer may read for this purpose (`ContentReadPurpose`): `MANAGE`
   * for the routes of the campaign's own spells, `CATALOG` for what the campaign may use. Archived
   * spells stay in the catalog while the campaign still uses them. Callers inside a transaction
   * pass its handle as `db`.
   */
  async requireReadableSpell(
    access: ContentAccess,
    spellId: string,
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<SpellWithAsset> {
    const found = await this.requireSpell(db, spellId);

    await access.require(purpose, found.asset, "Spell not found", db);

    return found;
  }

  /**
   * A spell an actor may newly learn or prepare in the campaign, for the actor modules: in the
   * catalog and active. A spell the viewer can read but that isn't active exists but can't be
   * chosen (409); one the viewer can't read is missing (404).
   */
  async requireSelectableSpell(
    access: ContentAccess,
    spellId: string,
    db: AppDatabase = this.db,
  ): Promise<SpellWithAsset & { definition: SpellDefinition }> {
    const found = await this.requireSpell(db, spellId);

    if (found.asset.status !== "ACTIVE" && (await access.allows("READ", found.asset, db))) {
      throw new ConflictError("Only active spells can be chosen", { spellId, status: found.asset.status });
    }

    await access.require("CATALOG", found.asset, "Spell not found", db);

    if (found.asset.status !== "ACTIVE") {
      throw new ConflictError("Only active spells can be chosen", { spellId, status: found.asset.status });
    }

    return { ...found, definition: parseSpellDefinition(found.spell) };
  }

  /**
   * Whether an actor may take the spell from these lists up to this level, for the progression
   * modules (`validateSpellAccess`): the spell is selectable, belongs to one of the lists in the
   * campaign and is not above the highest level the actor can cast. Returns the reasons it fails.
   */
  async checkSpellAccess(
    access: ContentAccess,
    spellId: string,
    input: { spellListAssetIds: readonly string[]; maximumSpellLevel: number },
    db: AppDatabase = this.db,
  ): Promise<{ allowed: boolean; reasons: string[] }> {
    const found = await this.requireSelectableSpell(access, spellId, db);
    const reasons: string[] = [];

    if (found.spell.level > input.maximumSpellLevel) {
      reasons.push(`The spell is level ${found.spell.level}, above ${input.maximumSpellLevel}`);
    }

    // Without lists the actor has nothing to take spells from.
    const lists = input.spellListAssetIds.length > 0 ? await this.listsOfSpell(access, found, db) : [];

    if (!lists.some(({ asset }) => input.spellListAssetIds.includes(asset.id))) {
      reasons.push("The spell is on none of the spell lists");
    }

    return { allowed: reasons.length === 0, reasons };
  }

  async loadRecord(db: AppDatabase, found: SpellWithAsset): Promise<SpellRecord> {
    const [record] = await this.loadRecords(db, [found]);

    return record as SpellRecord;
  }

  async loadRecords(db: AppDatabase, items: readonly SpellWithAsset[]): Promise<SpellRecord[]> {
    return this.withRulesets(db, items);
  }

  /**
   * Which assets the spell refers to the viewer may read; used to strip hidden references from
   * the player view. Without access (outside a campaign) only active global assets count.
   */
  async playerReferenceVisibility(
    db: AppDatabase,
    spell: SpellRow,
    definition: SpellDefinition,
    access: ContentAccess | null,
  ): Promise<(assetId: string) => boolean> {
    return this.assets.referenceVisibility(
      access,
      [
        ...storedSpellListIds(spell),
        ...collectChoiceReferences(definition.choices).map((reference) => reference.assetId),
      ],
      db,
    );
  }

  /** Custom spells that released custom lists of the campaign contain; players see them too. */
  async listReleasedEntryIds(input: { campaignId: string }, db: AppDatabase): Promise<string[]> {
    const ids = await this.repository.listReleasedEntryIds(db, input.campaignId);
    const found = await this.assets.findMany(ids, db);

    return [...found.values()]
      .filter((asset) => asset.assetType === "SPELL" && asset.campaignId === input.campaignId)
      .map((asset) => asset.id);
  }

  /** Edit routes for asset-links, for all custom spells of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.repository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, item]) => item.spell.campaignId === input.campaignId)
        .map(([assetId, item]) => [assetId, `${editRoutePrefix(input.campaignId)}/spells/${item.spell.id}`]),
    );
  }

  async findListEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    const found = await this.listRepository.findByAssetIds(db, input.assetIds);

    return new Map(
      [...found]
        .filter(([, item]) => item.spellList.campaignId === input.campaignId)
        .map(([assetId, item]) => [
          assetId,
          `${editRoutePrefix(input.campaignId)}/spell-lists/${item.spellList.id}`,
        ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Reading spell lists
  // ---------------------------------------------------------------------------

  async requireSpellList(db: AppDatabase, spellListId: string): Promise<SpellListWithAsset> {
    const found = await this.listRepository.findById(db, spellListId);

    if (!found) {
      throw new NotFoundError("Spell list not found");
    }

    return found;
  }

  async requireScopedSpellList(
    db: AppDatabase,
    path: { campaignId: string | null; spellListId: string },
  ): Promise<SpellListWithAsset> {
    const found = await this.requireSpellList(db, path.spellListId);

    if (found.spellList.campaignId !== path.campaignId) {
      throw new NotFoundError("Spell list not found");
    }

    return found;
  }

  async requireReadableSpellList(
    access: ContentAccess,
    spellListId: string,
    purpose: ContentReadPurpose,
    db: AppDatabase = this.db,
  ): Promise<SpellListWithAsset> {
    const found = await this.requireSpellList(db, spellListId);

    await access.require(purpose, found.asset, "Spell list not found", db);

    return found;
  }

  /**
   * The list a class refers to by asset id, if the viewer may read it in the catalog; null
   * otherwise, e.g. for an unreleased custom list of a released class.
   */
  async findReadableListByAsset(
    access: ContentAccess,
    listAssetId: string,
    db: AppDatabase = this.db,
  ): Promise<SpellListWithAsset | null> {
    const found = (await this.listRepository.findByAssetIds(db, [listAssetId])).get(listAssetId);

    return found && (await access.allows("CATALOG", found.asset, db)) ? found : null;
  }

  async loadListRecord(db: AppDatabase, found: SpellListWithAsset): Promise<SpellListRecord> {
    const [record] = await this.withRulesets(db, [found]);

    return record as SpellListRecord;
  }

  async loadListRecords(db: AppDatabase, items: readonly SpellListWithAsset[]): Promise<SpellListRecord[]> {
    return this.withRulesets(db, items);
  }

  /** Which spells belong to the list in the campaign: its own entries and the spells naming it. */
  membershipOf(found: SpellListWithAsset): SpellListMembership {
    return { listAssetId: found.asset.id, entryIds: storedSpellIds(found.spellList) };
  }

  /**
   * The lists the spell belongs to that the viewer may read in the campaign: lists holding it as an
   * entry and lists the spell names itself.
   */
  async listsOfSpell(
    access: ContentAccess,
    found: SpellWithAsset,
    db: AppDatabase = this.db,
  ): Promise<SpellListWithAsset[]> {
    const containing = await this.listRepository.listContaining(db, found.asset.id);
    const named = await this.listRepository.findByAssetIds(db, storedSpellListIds(found.spell));
    const all = new Map<string, SpellListWithAsset>();

    for (const item of [...containing, ...named.values()]) {
      all.set(item.asset.id, item);
    }

    const readable = await access.readableIds("CATALOG", [...all.values()].map(({ asset }) => asset), db);

    return [...all.values()]
      .filter(({ asset }) => readable.has(asset.id))
      .sort((a, b) => a.spellList.code.localeCompare(b.spellList.code));
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /**
   * Global content is changed by administrators only; custom content by GMs, editors and
   * administrators of the campaign. Non-members get 404.
   */
  async assertCanWrite(context: RequestContext, campaignId: string | null, db: AppDatabase): Promise<string> {
    return this.assets.assertCanWrite(context, "EDIT", campaignId, db);
  }

  /** Id of the acting user, after `assertCanWrite` checked the rights. */
  actorIdOf(context: RequestContext): string {
    return this.assets.assertAuthenticated(context);
  }

  /** Asset and spell in the transaction of the action; any failure undoes both. */
  async createSpell(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateSpellDto,
  ): Promise<SpellRecord> {
    const { name, summary, status, releasedToPlayers, sourceReference, rulesetPolicy, rulesetIds, assetFamilyId, code, ...fields } =
      input;
    const asset = await this.createAsset(scope, params, "SPELL", {
      name,
      summary,
      status,
      releasedToPlayers,
      sourceReference,
      rulesetPolicy,
      rulesetIds,
      assetFamilyId,
    });
    const created = await this.withConstraintErrors("spell", () =>
      scope.create(this.trackedSpell, {
        ...fields,
        campaignId: params.campaignId,
        assetId: asset.id,
        code: code ?? codeOf(name, "spell"),
      }),
    );

    return this.loadRecord(scope.tx, await this.requireSpell(scope.tx, created.id));
  }

  async createSpellList(
    scope: ActionScope,
    params: { actorId: string; campaignId: string | null },
    input: CreateSpellListDto,
  ): Promise<SpellListRecord> {
    const { name, summary, status, releasedToPlayers, sourceReference, rulesetPolicy, rulesetIds, assetFamilyId, code, ...fields } =
      input;
    const asset = await this.createAsset(scope, params, "SPELL_LIST", {
      name,
      summary,
      status,
      releasedToPlayers,
      sourceReference,
      rulesetPolicy,
      rulesetIds,
      assetFamilyId,
    });
    const created = await this.withConstraintErrors("spell list", () =>
      scope.create(this.trackedSpellList, {
        ...fields,
        campaignId: params.campaignId,
        assetId: asset.id,
        code: code ?? codeOf(name, "spell-list"),
      }),
    );

    return this.loadListRecord(scope.tx, await this.requireSpellList(scope.tx, created.id));
  }

  /**
   * Asset fields first, then the spell. `merged` names the fields of both that kept a newer value
   * from somebody else. The rules across rows are checked at the end of the action.
   */
  async updateSpell(
    scope: ActionScope,
    params: { found: SpellWithAsset; actorId: string; command: UpdateSpellDto },
  ): Promise<{ record: SpellRecord; merged: string[] }> {
    const merged = await this.updateContent(scope, {
      asset: params.found.asset,
      rowId: params.found.spell.id,
      actorId: params.actorId,
      command: params.command,
      kind: "spell",
    });

    return { record: await this.loadRecord(scope.tx, await this.requireSpell(scope.tx, params.found.spell.id)), merged };
  }

  async updateSpellList(
    scope: ActionScope,
    params: { found: SpellListWithAsset; actorId: string; command: UpdateSpellListDto },
  ): Promise<{ record: SpellListRecord; merged: string[] }> {
    const merged = await this.updateContent(scope, {
      asset: params.found.asset,
      rowId: params.found.spellList.id,
      actorId: params.actorId,
      command: params.command,
      kind: "spell list",
    });

    return {
      record: await this.loadListRecord(scope.tx, await this.requireSpellList(scope.tx, params.found.spellList.id)),
      merged,
    };
  }

  /** Archives or restores the asset; archiving fails while other content still refers to it. */
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
    assetType: "SPELL" | "SPELL_LIST",
    input: Pick<
      CreateSpellListDto,
      | "name"
      | "summary"
      | "status"
      | "releasedToPlayers"
      | "sourceReference"
      | "rulesetPolicy"
      | "rulesetIds"
      | "assetFamilyId"
    >,
  ): Promise<AssetRow> {
    const fallback = assetType === "SPELL" ? "spell" : "spell-list";
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType,
        title: input.name,
        // Codes are unique per scope and ruleset, names may repeat.
        slug: slugify(input.name, { unique: true, fallback }),
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

  private async updateContent(
    scope: ActionScope,
    params: {
      asset: AssetRow;
      rowId: string;
      actorId: string;
      command: UpdateSpellDto | UpdateSpellListDto;
      kind: ContentKindName;
    },
  ): Promise<string[]> {
    const { expectedVersion, expectedAssetVersion, ...fields } = params.command as Record<string, unknown> & {
      expectedVersion: number;
      expectedAssetVersion: number;
    };
    const merged: string[] = [];

    if (params.asset.status === "ARCHIVED") {
      throw new ConflictError("Archived content cannot be modified", { assetId: params.asset.id });
    }

    const assetPatch = Object.fromEntries(
      ASSET_FIELDS.filter((key) => fields[key] !== undefined).map((key) => [
        key === "name" ? "title" : key,
        fields[key],
      ]),
    );

    if (Object.keys(assetPatch).length > 0) {
      const result = await this.assets.updateMetadata(scope, {
        assetId: params.asset.id,
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

    if (Object.keys(set).length === 0) {
      return merged;
    }

    const result =
      params.kind === "spell"
        ? await this.withConstraintErrors(params.kind, () =>
            scope.change(this.trackedSpell, params.rowId, async (current) => ({
              set: await this.withBaseDefinition(scope, current, set, expectedVersion),
              baseVersion: expectedVersion,
            })),
          )
        : await this.withConstraintErrors(params.kind, () =>
            scope.change(this.trackedSpellList, params.rowId, () => ({ set, baseVersion: expectedVersion })),
          );

    merged.push(...result.merged);

    return merged;
  }

  /**
   * The history compares only the fields that were sent. A client that changes one field of the
   * definition group sends the others unchanged in its mind, so they are added with their value at
   * its base version: when somebody else changed one of them in the meantime, the group makes that
   * a conflict (412) instead of a mix of two versions. Like `FeatsService`.
   */
  private async withBaseDefinition(
    scope: ActionScope,
    current: SpellRow,
    set: Record<string, unknown>,
    baseVersion: number,
  ): Promise<Record<string, unknown>> {
    const group: readonly string[] = SPELL_DEFINITION_GROUP;

    if (baseVersion >= current.version || !Object.keys(set).some((key) => group.includes(key))) {
      return set;
    }

    const completed = { ...set };

    for (const part of SPELL_DEFINITION_GROUP) {
      if (completed[part] === undefined) {
        const stored = await scope.valueAt(this.trackedSpell, current.id, part, baseVersion);

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
   * What stored content refers to, for the reference index. A spell refers to the lists it names
   * (`LIST`) and to assets its choice options link to (`DEFINITION`); a list to its spells
   * (`ENTRY`). Null for a spell whose definition no longer parses: the stored references stay.
   */
  async listContentReferences(asset: AssetRow, db: AppDatabase): Promise<ContentReference[] | null> {
    const owner = await this.findOwner(db, asset);

    if (!owner) {
      return [];
    }

    // Unknown while the stored content doesn't parse; the stored references stay.
    return owner.references?.map(({ assetId, path, kind }) => ({ assetId, path, kind })) ?? null;
  }

  /**
   * The content check at the end of every action that touched a spell or a list (see
   * `ContentTypeDefinition.verify`), on the state the action leaves behind: the definition, the
   * code per ruleset and the referenced lists, spells and options. Throws the first failing
   * category.
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const owner = await this.findOwner(db, asset);

    if (!owner) {
      return;
    }

    if (owner.kind === "spell") {
      parseSpellDefinition(owner.spell as SpellRow);
    }

    if (owner.references === null) {
      throw new ValidationError(`The stored ${owner.kind} is invalid`);
    }

    await this.assertSystemCodeFree(db, owner.kind, owner.row);

    const { missing, issues } = await this.collectReferenceIssues(db, owner.row, owner.references);

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError(`The ${owner.kind} refers to unavailable assets`, { issues });
    }

    const referrers = await this.collectReferrerIssues(db, asset);

    if (referrers.length > 0) {
      throw new ConflictError(`Content that refers to this ${owner.kind} no longer fits it`, {
        assetId: asset.id,
        usages: referrers,
      });
    }
  }

  /** Every issue of a stored spell or list, from the schemas to the references; for `validate`. */
  async validateStored(db: AppDatabase, asset: AssetRow): Promise<DefinitionIssue[]> {
    let owner: Awaited<ReturnType<SpellsService["findOwner"]>>;

    try {
      owner = await this.findOwner(db, asset);
    } catch (error) {
      return issuesOf(error);
    }

    if (!owner) {
      return [];
    }

    if (owner.kind === "spell") {
      try {
        parseSpellDefinition(owner.spell as SpellRow);
      } catch (error) {
        return issuesOf(error);
      }
    }

    const issues: DefinitionIssue[] = [];

    if (asset.status === "ARCHIVED") {
      issues.push({ path: ["status"], message: `The ${owner.kind} is archived` });
    }

    try {
      await this.assertSystemCodeFree(db, owner.kind, owner.row, { lock: false });
    } catch (error) {
      if (!(error instanceof ConflictError)) {
        throw error;
      }

      issues.push({ path: ["code"], message: error.message });
    }

    if (owner.references === null) {
      return [...issues, { path: ["spellIds"], message: "The stored entries are invalid" }];
    }

    const references = await this.collectReferenceIssues(db, owner.row, owner.references);
    const referrers = (await this.collectReferrerIssues(db, asset)).map((usage) => ({
      path: [],
      message: `${usage.name} (${usage.assetType}) refers to it but no longer fits: ${usage.message}`,
    }));

    return [...issues, ...references.missing, ...references.issues, ...referrers];
  }

  /**
   * The row behind a spell or list asset and what its stored content refers to, with the kind of
   * each reference for the index: a spell refers to the lists it names (`LIST`) and to assets its
   * choice options link to (`DEFINITION`), a list to its spells (`ENTRY`). `references` is null
   * while the stored content doesn't parse.
   */
  private async findOwner(
    db: AppDatabase,
    asset: AssetRow,
  ): Promise<{
    kind: ContentKindName;
    row: Owner;
    references: KindedReference[] | null;
    spell: SpellRow | null;
  } | null> {
    if (asset.assetType === "SPELL_LIST") {
      const found = (await this.listRepository.findByAssetIds(db, [asset.id])).get(asset.id);

      if (!found) {
        return null;
      }

      const entries = SpellListEntriesSchema.safeParse(found.spellList.spellIds);

      return {
        kind: "spell list",
        row: found.spellList,
        references: entries.success ? withKind(collectEntryReferences(entries.data), "ENTRY") : null,
        spell: null,
      };
    }

    const found = (await this.repository.findByAssetIds(db, [asset.id])).get(asset.id);

    if (!found) {
      return null;
    }

    const definition = tryParseSpellDefinition(found.spell);

    return {
      kind: "spell",
      row: found.spell,
      references: definition
        ? [
            ...withKind(collectListReferences(storedSpellListIds(found.spell)), "LIST"),
            ...withKind(collectChoiceReferences(definition.choices), "DEFINITION"),
          ]
        : null,
      spell: found.spell,
    };
  }

  /**
   * The other direction of the reference checks: lists holding this spell and spells naming this
   * list must still accept it after the action, e.g. after a global spell's rulesets were
   * narrowed. Archived referrers don't count. Reads the reference index, which holds the final
   * state of the action at this point.
   */
  private async collectReferrerIssues(
    db: AppDatabase,
    asset: AssetRow,
  ): Promise<{ assetId: string; assetType: string; name: string; path: string; message: string }[]> {
    const kind = asset.assetType === "SPELL" ? "ENTRY" : "LIST";
    const referrers = (await this.assets.repository.listReferencing(db, asset.id)).filter(
      ({ source, reference }) => source.status !== "ARCHIVED" && reference.kind === kind,
    );
    const result: { assetId: string; assetType: string; name: string; path: string; message: string }[] = [];

    for (const { source, reference } of referrers) {
      const { missing, issues } = await this.collectReferenceIssues(
        db,
        { assetId: source.id, campaignId: source.campaignId },
        [{ assetId: asset.id, path: reference.path.split("."), assetTypes: [asset.assetType] }],
      );

      for (const issue of [...missing, ...issues]) {
        result.push({
          assetId: source.id,
          assetType: source.assetType,
          name: source.title,
          path: reference.path,
          message: issue.message,
        });
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Rules that need the database
  // ---------------------------------------------------------------------------

  /**
   * Global content shares codes across rulesets (2014 and 2024 Fireball), but two active global
   * spells (or lists) with the same code must not both be available for one ruleset; a neutral one
   * is available for all of them. Custom content is kept unique per campaign by an index.
   */
  private async assertSystemCodeFree(
    db: AppDatabase,
    kind: ContentKindName,
    row: Owner,
    options: { lock: boolean } = { lock: true },
  ): Promise<void> {
    if (row.campaignId !== null) {
      return;
    }

    if (options.lock) {
      await lockSystemCode(db, kind === "spell" ? "spells" : "spell-lists", row.code);
    }

    const sameCode =
      kind === "spell"
        ? (await this.repository.listSystemByCode(db, { code: row.code, exceptSpellId: row.id })).map(
            ({ asset }) => asset,
          )
        : (await this.listRepository.listSystemByCode(db, { code: row.code, exceptSpellListId: row.id })).map(
            ({ asset }) => asset,
          );
    const others = sameCode.filter((asset) => asset.status !== "ARCHIVED" && asset.id !== row.assetId);

    if (others.length === 0) {
      return;
    }

    const own = await this.assets.ownRulesets(db, row.assetId);
    const otherRulesets = await this.assets.repository.listRulesetIds(
      db,
      others.map((asset) => asset.id),
    );

    for (const asset of others) {
      const theirs = asset.rulesetPolicy === "NEUTRAL" ? null : (otherRulesets.get(asset.id) ?? []);
      const overlaps = own === null || theirs === null || own.some((rulesetId) => theirs.includes(rulesetId));

      if (overlaps) {
        throw new ConflictError(`The ${kind} code is already used for one of these rulesets`, {
          code: row.code,
          assetId: asset.id,
        });
      }
    }
  }

  /**
   * Missing assets and assets of other campaigns are 404 (`missing`); wrong types, archived or
   * incompatible assets are 409 (`issues`). A custom spell may name global lists of its ruleset; a
   * global one only global lists that cover all of its rulesets.
   */
  private async collectReferenceIssues(
    db: AppDatabase,
    owner: Pick<Owner, "assetId" | "campaignId">,
    references: readonly AssetReference[],
  ): Promise<{ missing: DefinitionIssue[]; issues: DefinitionIssue[] }> {
    const campaignRulesetId =
      owner.campaignId === null ? null : await this.campaignAccess.findRulesetId(owner.campaignId, db);

    return this.assets.collectReferenceIssues(
      db,
      { assetId: owner.assetId, campaignId: owner.campaignId, campaignRulesetId },
      references,
    );
  }

  // ---------------------------------------------------------------------------
  // Usages
  // ---------------------------------------------------------------------------

  async getUsages(access: ContentAccess, assetId: string) {
    return this.links.getUsages(access, assetId);
  }

  private async withRulesets<T extends { asset: AssetRow }>(
    db: AppDatabase,
    items: readonly T[],
  ): Promise<(T & { rulesetIds: readonly string[] })[]> {
    const rulesetIds = await this.assets.repository.listRulesetIds(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, rulesetIds: rulesetIds.get(item.asset.id) ?? [] }));
  }

  private async withConstraintErrors<T>(kind: ContentKindName, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError(`The ${kind} code is already in use`);
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError(`The ${kind} violates a database constraint`);
      }

      throw error;
    }
  }
}

type KindedReference = AssetReference & { kind: "LIST" | "DEFINITION" | "ENTRY" };

function withKind(references: readonly AssetReference[], kind: KindedReference["kind"]): KindedReference[] {
  return references.map((reference) => ({ ...reference, kind }));
}

/** A code from the name, cut to the column length. */
function codeOf(name: string, fallback: string): string {
  return slugify(name, { fallback }).slice(0, 100).replace(/-+$/, "");
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
