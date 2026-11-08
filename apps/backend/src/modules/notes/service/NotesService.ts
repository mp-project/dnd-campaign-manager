import { campaignRoleOf } from "#core/content/viewer";
import { findPgErrorCode } from "#core/db/findPgErrorCode";
import type { AppDatabase, TransactionManager } from "#core/db/pool";
import { ConflictError, NotFoundError } from "#core/error/http/index";
import type { ActionScope } from "#core/history/types";
import { type AssetLinksService, editRoutePrefix } from "#src/modules/asset-links/index";
import {
  type AssetRow,
  type AssetsService,
  type ContentAccess,
  slugify,
} from "#src/modules/assets/index";
import type { ContentSharesService } from "#src/modules/content-shares/index";
import type { TagsService } from "#src/modules/tags/index";
import type { CreateNoteDto } from "#src/modules/notes/domain/dto/CreateNoteDto";
import type { UpdateNoteDto } from "#src/modules/notes/domain/dto/UpdateNoteDto";
import type {
  NoteRecord,
  NotesRepository,
  NoteWithAsset,
} from "#src/modules/notes/domain/repository/NotesRepository";
import { createTrackedNote, type TrackedNote } from "#src/modules/notes/history/TrackedNote";

/** Campaign facts the module needs; provided by the campaigns module. */
export type NoteCampaignAccessPort = {
  findCampaignRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<{ role: "EDITOR" | "PLAYER" | null; isOwner: boolean } | null>;
};

type NotePath = { campaignId: string; noteId: string };

const ASSET_FIELD_NAMES: Record<string, string> = { title: "name" };

/**
 * Notes, handouts and other free texts of a campaign. Each note is an asset of type `NOTE`: the
 * asset holds name, summary, status and tags, the note row the text. Players never get a note
 * directly; they see what a content share reveals, through the player view.
 */
export class NotesService {
  public readonly trackedNote: TrackedNote;

  constructor(
    public readonly db: AppDatabase,
    public readonly transactionManager: TransactionManager,
    public readonly repository: NotesRepository,
    private readonly assets: AssetsService,
    private readonly tags: TagsService,
    private readonly links: AssetLinksService,
    private readonly shares: ContentSharesService,
    campaignAccess: NoteCampaignAccessPort,
  ) {
    this.trackedNote = createTrackedNote({
      resolveRole: async (campaignId, actorId, tx) =>
        campaignRoleOf(await campaignAccess.findCampaignRole(campaignId, actorId, tx)),
      assertAssetChangeable: async (assetId, tx) => {
        const asset = await assets.requireAsset(tx, assetId);

        if (asset.status === "ARCHIVED") {
          throw new ConflictError("Archived notes cannot be modified", { assetId });
        }
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Reading
  // ---------------------------------------------------------------------------

  async requireNote(db: AppDatabase, path: NotePath): Promise<NoteWithAsset> {
    const found = await this.repository.findById(db, path.noteId);

    if (!found || found.note.campaignId !== path.campaignId) {
      throw new NotFoundError("Note not found");
    }

    return found;
  }

  async loadRecord(db: AppDatabase, found: NoteWithAsset): Promise<NoteRecord> {
    return { ...found, tagIds: await this.tags.repository.listIdsForAsset(db, found.asset.id) };
  }

  async loadRecords(db: AppDatabase, items: readonly NoteWithAsset[]): Promise<NoteRecord[]> {
    const tagIds = await this.tags.repository.listIdsForAssets(
      db,
      items.map(({ asset }) => asset.id),
    );

    return items.map((item) => ({ ...item, tagIds: tagIds.get(item.asset.id) ?? [] }));
  }

  /**
   * A note of the campaign the viewer may read: the full view gets every note, players only active
   * notes shared with them. Everything else is reported as missing, so ids don't leak.
   */
  async requireReadableNote(access: ContentAccess, path: NotePath): Promise<NoteWithAsset> {
    const found = await this.requireNote(this.db, path);

    await access.require("MANAGE", found.asset, "Note not found");

    return found;
  }

  /** Player view of a shared note; content-shares checks the share before it calls this. */
  async loadPlayerContent(
    input: { campaignId: string; assetId: string },
    db: AppDatabase,
  ): Promise<NoteWithAsset> {
    const found = await this.repository.findByAssetId(db, input.assetId);

    if (!found || found.note.campaignId !== input.campaignId) {
      throw new NotFoundError("Note not found");
    }

    return found;
  }

  /** Edit routes for asset-links, for all notes of one request in one query. */
  async findEditRoutes(
    input: { campaignId: string | null; assetIds: readonly string[] },
    db: AppDatabase,
  ): Promise<Map<string, string>> {
    if (input.campaignId === null) {
      return new Map();
    }

    const noteIds = await this.repository.findIdsByAssetIds(db, input.assetIds);

    return new Map(
      [...noteIds].map(([assetId, noteId]) => [
        assetId,
        `${editRoutePrefix(input.campaignId)}/notes/${noteId}`,
      ]),
    );
  }

  // ---------------------------------------------------------------------------
  // Writing
  // ---------------------------------------------------------------------------

  /** Asset, note, tags and links in the transaction of the action; any failure undoes all of it. */
  async createNote(
    scope: ActionScope,
    params: { actorId: string; campaignId: string },
    input: CreateNoteDto,
  ): Promise<NoteRecord> {
    const { asset } = await this.assets.createBase(
      scope,
      { actorId: params.actorId, campaignId: params.campaignId },
      {
        assetType: "NOTE",
        title: input.name,
        // Names may repeat, and notes are found by id.
        slug: slugify(input.name, { unique: true, fallback: "note" }),
        summary: input.summary ?? null,
        status: input.status,
        rulesetPolicy: "NEUTRAL",
      },
    );
    const note = await this.withConstraintErrors(() =>
      scope.create(this.trackedNote, {
        campaignId: params.campaignId,
        assetId: asset.id,
        noteType: input.noteType,
        contentFormat: input.contentFormat,
        content: input.content,
        gmNotes: input.gmNotes ?? null,
        sortOrder: input.sortOrder ?? 0,
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
        { actorId: params.actorId, campaignId: params.campaignId, sourceAssetId: asset.id },
        link,
      );
    }

    return this.loadRecord(scope.tx, await this.requireNote(scope.tx, { ...params, noteId: note.id }));
  }

  /**
   * Tags first, because assigning locks the tags before the asset, like deleting a tag does. Then
   * the asset fields and last the note. `merged` names the fields of all of them that kept a newer
   * value from somebody else.
   */
  async updateNote(
    scope: ActionScope,
    params: NotePath & { actorId: string; command: UpdateNoteDto },
  ): Promise<{ record: NoteRecord; merged: string[] }> {
    const {
      expectedVersion,
      expectedAssetVersion,
      name,
      summary,
      status,
      tagIds,
      ...noteFields
    } = params.command;
    const { note, asset } = await this.requireNote(scope.tx, params);
    const merged: string[] = [];

    if (asset.status === "ARCHIVED") {
      throw new ConflictError("Archived notes cannot be modified", { assetId: asset.id });
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
        actorId: params.actorId,
        patch: {
          ...(name !== undefined ? { title: name } : {}),
          ...(summary !== undefined ? { summary } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      });

      merged.push(...result.merged.map((field) => ASSET_FIELD_NAMES[field] ?? field));
    }

    const set = Object.fromEntries(
      Object.entries(noteFields).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(set).length > 0) {
      const result = await scope.change(this.trackedNote, note.id, () => ({
        set,
        baseVersion: expectedVersion,
      }));

      merged.push(...result.merged);
    }

    const record = await this.loadRecord(scope.tx, await this.requireNote(scope.tx, params));

    return { record, merged };
  }

  /** Archives the asset; the deactivate hook ends the shares of the note. */
  async archiveNote(
    scope: ActionScope,
    params: NotePath & { expectedAssetVersion: number },
  ): Promise<NoteRecord> {
    const { asset } = await this.requireNote(scope.tx, params);

    await this.assets.archiveBase(scope, {
      assetId: asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireNote(scope.tx, params));
  }

  /** Shares ended by archiving stay ended; the GM shares the note again if wanted. */
  async restoreNote(
    scope: ActionScope,
    params: NotePath & { expectedAssetVersion: number },
  ): Promise<NoteRecord> {
    const { asset } = await this.requireNote(scope.tx, params);

    await this.assets.restoreBase(scope, {
      assetId: asset.id,
      expectedVersion: params.expectedAssetVersion,
    });

    return this.loadRecord(scope.tx, await this.requireNote(scope.tx, params));
  }

  /**
   * Registered as deactivate hook: a note that was hidden as draft or archived must not be revealed
   * again when it becomes active, so the GM has to share it anew.
   */
  async endSharesOfHiddenNote(asset: AssetRow, db: AppDatabase): Promise<void> {
    if (asset.assetType === "NOTE") {
      await this.shares.endSharesOfAsset(db, asset.id);
    }
  }

  private async withConstraintErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const code = findPgErrorCode(error);

      if (code === "23505") {
        throw new ConflictError("The asset already has a note");
      }

      if (code === "23503") {
        throw new NotFoundError("Referenced campaign or asset not found");
      }

      if (code === "23514") {
        throw new ConflictError("The note violates a database constraint");
      }

      throw error;
    }
  }
}
