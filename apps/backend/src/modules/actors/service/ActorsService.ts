import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import { computeStatBlock } from "#src/modules/actors/domain/ActorStatBlock";
import {
  type ActorParts,
  DEFAULT_ACTOR_PARTS,
  type LootEntry,
} from "#src/modules/actors/domain/dto/ActorPartsDto";
import type { CreateActorDto } from "#src/modules/actors/domain/dto/CreateActorDto";
import type { UpdateActorDto } from "#src/modules/actors/domain/dto/UpdateActorDto";
import { ACTOR_PARTS } from "#src/modules/actors/domain/entities/ActorsTable";
import type {
  ActorRecord,
  ActorRow,
  ActorsRepository,
  ActorWithAsset,
} from "#src/modules/actors/domain/repository/ActorsRepository";
import {
  createTrackedActor,
  readActorParts,
  type TrackedActor,
  tryParseActorParts,
} from "#src/modules/actors/history/TrackedActor";
import { type AssetLinksService, editRoutePrefix } from "#src/modules/asset-links/index";
import {
  type AssetReference,
  type AssetRow,
  type AssetsService,
  type ContentAccess,
  type ContentReference,
  slugify,
} from "#src/modules/assets/index";
import type { ItemInstancesService } from "#src/modules/items/index";
import type { TagsService } from "#src/modules/tags/index";

/** Campaign facts the module needs; provided by the campaigns module. */
export type ActorCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
  findRulesetId(campaignId: string, db: AppDatabase): Promise<string | null>;
};

type ActorPath = { campaignId: string; actorId: string };

const ASSET_FIELD_NAMES: Record<string, string> = { title: "name" };

/** Item references of the parts, with the kind the reference index stores. */
function itemReferencesOf(parts: Pick<ActorParts, "proficiencies" | "loot">) {
  return [
    ...parts.proficiencies.flatMap((entry, index) =>
      entry.itemAssetId === null
        ? []
        : [{ assetId: entry.itemAssetId, path: ["proficiencies", index, "itemAssetId"], kind: "PROFICIENCY" }],
    ),
    ...parts.loot.flatMap((entry, index) =>
      entry.kind === "ITEM"
        ? [{ assetId: entry.itemAssetId, path: ["loot", index, "itemAssetId"], kind: "LOOT" }]
        : [],
    ),
  ];
}

const carriedIdsOf = (loot: readonly LootEntry[]) =>
  loot.flatMap((entry) => (entry.kind === "CARRIED_ITEM" ? [entry.itemInstanceId] : []));

/**
 * Characters, NPCs and monsters of a campaign: one kind of entity for all of them, on assets of type
 * `ACTOR`. The asset holds name, summary, status and tags, the actor row the base values a stat block
 * is computed from; the category only sorts and filters and may change. Players never get an actor
 * directly; they see what a content share reveals, through the player view.
 */
export class ActorsService {
  public readonly trackedActor: TrackedActor;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: ActorsRepository,
    private readonly assets: AssetsService,
    private readonly tags: TagsService,
    private readonly links: AssetLinksService,
    private readonly itemInstances: ItemInstancesService,
    private readonly campaignAccess: ActorCampaignAccessPort,
  ) {
    this.trackedActor = createTrackedActor({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertChangeable: async (row, tx) => {
        const asset = await assets.requireAsset(tx, row.assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived actors cannot be modified", { assetId: asset.id });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireActor(db: AppDatabase, path: ActorPath): Promise<ActorWithAsset> {
    const found = await this.repository.findById(db, path.actorId);

    if (!found || found.actor.campaignId !== path.campaignId) {
      throw new NotFoundError("Actor not found");
    }

    return found;
  }

  async loadRecord(db: AppDatabase, found: ActorWithAsset): Promise<ActorRecord> {
    return { ...found, tagIds: await this.tags.repository.listIdsForAsset(db, found.asset.id) };
  }

  async loadRecords(db: AppDatabase, items: readonly ActorWithAsset[]): Promise<ActorRecord[]> {
    const tagIds = await this.tags.repository.listIdsForAssets(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, tagIds: tagIds.get(item.asset.id) ?? [] }));
  }

  /**
   * An actor of the campaign the viewer may read: the full view gets every actor, players only active
   * actors shared with them. Everything else is reported as missing, so ids don't leak.
   */
  async requireReadableActor(access: ContentAccess, path: ActorPath): Promise<ActorWithAsset> {
    const found = await this.requireActor(this.db, path);

    await access.require("MANAGE", found.asset, "Actor not found");

    return found;
  }

  /** Player view of a shared actor; content-shares checks the share before it calls this. */
  async loadPlayerContent(
    input: { campaignId: string; assetId: string },
    db: AppDatabase,
  ): Promise<ActorWithAsset> {
    const found = await this.repository.findByAssetId(db, input.assetId);

    if (!found || found.actor.campaignId !== input.campaignId) {
      throw new NotFoundError("Actor not found");
    }

    return found;
  }

  /** Item instances the actor owns now, to tell whether carried loot is still there. */
  async listOwnedInstanceIds(db: AppDatabase, assetId: string): Promise<Set<string>> {
    return new Set(
      (await this.itemInstances.repository.listByOwner(db, assetId)).map((instance) => instance.id),
    );
  }

  /** The stat block from the base values and the items the actor owns; computed on every read. */
  async computeStatBlock(db: AppDatabase, found: ActorWithAsset) {
    const parts = readActorParts(found.actor);
    const owned = await this.itemInstances.listOwnedByActor(db, found.asset.id);

    return computeStatBlock(
      parts,
      owned.map(({ instance, name, resolve }) => ({
        instanceId: instance.id,
        itemAssetId: instance.itemAssetId,
        name,
        quantity: instance.quantity,
        equipped: instance.equipped,
        attuned: instance.attuned,
        resolve,
      })),
    );
  }

  /** Edit routes for asset-links, for all actors of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    if (input.campaignId === null) {
      return new Map();
    }

    const actorIds = await this.repository.findIdsByAssetIds(db, input.assetIds);

    return new Map(
      [...actorIds].map(([assetId, actorId]) => [
        assetId,
        `${editRoutePrefix(input.campaignId)}/actors/${actorId}`,
      ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Content kernel
  // ---------------------------------------------------------------------------

  /** Items named as proficiencies and planned loot; null when the stored parts no longer parse. */
  async listContentReferences(asset: AssetRow, db: AppDatabase): Promise<ContentReference[] | null> {
    const found = await this.repository.findByAssetId(db, asset.id);

    if (!found) {
      return [];
    }

    const parts = tryParseActorParts(found.actor);

    return parts === null ? null : itemReferencesOf(parts);
  }

  /**
   * Runs at the end of every action that touched the actor: the items it names exist, are items and
   * may be used in the campaign (global ones of its ruleset or its own, not archived).
   */
  async verifyContent(asset: AssetRow, db: AppDatabase): Promise<void> {
    const found = await this.repository.findByAssetId(db, asset.id);

    if (!found) {
      return;
    }

    const parts = readActorParts(found.actor);
    const references: AssetReference[] = itemReferencesOf(parts).map((reference) => ({
      assetId: reference.assetId,
      path: reference.path,
      assetTypes: ["ITEM"],
    }));
    const { missing, issues } = await this.assets.collectReferenceIssues(
      db,
      {
        assetId: asset.id,
        campaignId: found.actor.campaignId,
        campaignRulesetId: await this.campaignAccess.findRulesetId(found.actor.campaignId, db),
      },
      references,
    );

    if (missing.length > 0) {
      throw new NotFoundError("Referenced asset not found", { issues: missing });
    }

    if (issues.length > 0) {
      throw new ConflictError("The actor refers to items it may not use", { issues });
    }
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /** Asset, actor, tags and links in the transaction of the action; any failure undoes all of it. */
  async createActor(
    scope: ActionScope,
    params: { userId: string; campaignId: string },
    input: CreateActorDto,
  ): Promise<ActorRecord> {
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.userId, campaignId: params.campaignId },
      {
        assetType: "ACTOR",
        title: input.name,
        // Names may repeat (three goblins), and actors are found by id.
        slug: slugify(input.name, { unique: true, fallback: "actor" }),
        summary: input.summary ?? null,
        status: input.status,
        rulesetPolicy: "NEUTRAL",
      },
    );
    const parts = Object.fromEntries(
      ACTOR_PARTS.map((part) => [part, input[part] ?? DEFAULT_ACTOR_PARTS[part]]),
    ) as ActorParts;

    // A new asset owns no instances yet, so carried loot can't name any.
    await this.assertCarriedLootOwned(scope.tx, asset.id, [], parts.loot);

    const actor = await this.withConstraintErrors(() =>
      scope.create(this.trackedActor, {
        campaignId: params.campaignId,
        assetId: asset.id,
        category: input.category,
        displayName: input.displayName ?? null,
        size: input.size ?? "MEDIUM",
        creatureType: input.creatureType ?? null,
        creatureSubtype: input.creatureSubtype ?? null,
        alignment: input.alignment ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null,
        gmNotes: input.gmNotes ?? null,
        ...parts,
      }),
    );

    if (input.tagIds?.length) {
      await this.tags.replaceAssignments(scope, {
        campaignId: params.campaignId,
        assetId: asset.id,
        tagIds: input.tagIds,
      });
    }

    for (const link of input.relatedLinks ?? []) {
      await this.links.createLink(
        scope,
        { actorId: params.userId, campaignId: params.campaignId, sourceAssetId: asset.id },
        link,
      );
    }

    return this.loadRecord(
      scope.tx,
      await this.requireActor(scope.tx, { campaignId: params.campaignId, actorId: actor.id }),
    );
  }

  /**
   * Tags first, because assigning locks the tags before the asset, like deleting a tag does. Then
   * the asset fields and last the actor. `merged` names the fields of all of them that kept a newer
   * value from somebody else.
   */
  async updateActor(
    scope: ActionScope,
    params: ActorPath & { userId: string; command: UpdateActorDto },
  ): Promise<{ record: ActorRecord; merged: string[] }> {
    const {
      expectedVersion,
      expectedAssetVersion,
      name,
      summary,
      status,
      tagIds,
      ...actorFields
    } = params.command;
    const { actor, asset } = await this.requireActor(scope.tx, params);
    const merged: string[] = [];

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived actors cannot be modified", { assetId: asset.id });
    }

    if (actorFields.loot !== undefined) {
      await this.assertCarriedLootOwned(
        scope.tx,
        asset.id,
        carriedIdsOf(tryParseActorParts(actor)?.loot ?? []),
        actorFields.loot,
      );
    }

    if (tagIds !== undefined) {
      const result = await this.tags.replaceAssignments(scope, {
        campaignId: params.campaignId,
        assetId: asset.id,
        tagIds,
        expectedVersion: expectedAssetVersion,
      });

      merged.push(...result.merged);
    }

    if (name !== undefined || summary !== undefined || status !== undefined) {
      const result = await this.assets.updateMetadata(scope, {
        assetId: asset.id,
        expectedVersion: expectedAssetVersion,
        actorId: params.userId,
        patch: {
          ...(name !== undefined ? { title: name } : {}),
          ...(summary !== undefined ? { summary } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      });

      merged.push(...result.merged.map((field) => ASSET_FIELD_NAMES[field] ?? field));
    }

    const set = Object.fromEntries(
      Object.entries(actorFields).filter(([, value]) => value !== undefined),
    ) as Partial<ActorRow>;

    if (Object.keys(set).length > 0) {
      const result = await scope.change(this.trackedActor, actor.id, () => ({
        set,
        baseVersion: expectedVersion,
      }));

      merged.push(...result.merged);
    }

    const record = await this.loadRecord(scope.tx, await this.requireActor(scope.tx, params));

    return { record, merged };
  }

  /** Archives the asset; the deactivate hook ends the shares of the actor. */
  async archiveActor(
    scope: ActionScope,
    params: ActorPath & { expectedAssetVersion: number },
  ): Promise<ActorRecord> {
    const { asset } = await this.requireActor(scope.tx, params);

    await this.assets.archiveBase(scope, {
      assetId: asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireActor(scope.tx, params));
  }

  /** Shares ended by archiving stay ended; the GM shares the actor again if wanted. */
  async restoreActor(
    scope: ActionScope,
    params: ActorPath & { expectedAssetVersion: number },
  ): Promise<ActorRecord> {
    const { asset } = await this.requireActor(scope.tx, params);

    await this.assets.restoreBase(scope, {
      assetId: asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireActor(scope.tx, params));
  }

  /**
   * Carried loot that a request adds must be an instance the actor owns, and a part of a stack no
   * more than the stack holds. Entries already there are left alone: the item may have changed hands
   * since, which the read shows as `available: false` instead of blocking every other change.
   */
  private async assertCarriedLootOwned(
    db: AppDatabase,
    assetId: string,
    previousIds: readonly string[],
    loot: readonly LootEntry[],
  ): Promise<void> {
    const before = new Set(previousIds);
    const added = loot.flatMap((entry, index) =>
      entry.kind === "CARRIED_ITEM" && !before.has(entry.itemInstanceId) ? [{ entry, index }] : [],
    );

    if (added.length === 0) {
      return;
    }

    const owned = new Map(
      (await this.itemInstances.repository.listByOwner(db, assetId)).map((instance) => [instance.id, instance]),
    );
    const issues = added.flatMap(({ entry, index }) => {
      const instance = owned.get(entry.itemInstanceId);

      if (!instance) {
        return [{ path: ["loot", index, "itemInstanceId"], message: "The actor does not own this item" }];
      }

      if (entry.quantity !== null && entry.quantity > instance.quantity) {
        return [{ path: ["loot", index, "quantity"], message: "More than the stack holds" }];
      }

      return [];
    });

    if (issues.length > 0) {
      throw new ConflictError("Carried loot must be items the actor owns", { issues });
    }
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("The asset already has an actor");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The actor violates a database constraint");
      }

      throw error;
    }
  }
}
