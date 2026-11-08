import type { AppDatabase } from "#core/db/pool";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";
import { NoteBaseSchema } from "#src/modules/notes/domain/dto/BaseNoteDto";
import { notes } from "#src/modules/notes/domain/entities/NotesTable";
import type { NoteRow } from "#src/modules/notes/domain/repository/NotesRepository";

export const NOTE_ENTITY_TYPE = "note";

export const NOTE_ACTIONS = {
  create: "note.create",
  update: "note.update",
  delete: "note.delete",
  restore: "note.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const NOTE_ASSET_ACTIONS: readonly string[] = [
  NOTE_ACTIONS.update,
  NOTE_ACTIONS.delete,
  NOTE_ACTIONS.restore,
];

type TrackedNoteDeps = {
  resolveRole(
    campaignId: string,
    actorId: string,
    db: AppDatabase,
  ): Promise<CampaignRole | null>;
  /** Undoing and restoring must not change notes of archived assets either. */
  assertAssetChangeable(assetId: string, db: AppDatabase): Promise<void>;
};

/**
 * History rules of the note text: GMs and editors may change it, so only they read the history. In
 * the history of the asset the note appears as a child (`includeChildren`); name, summary, status
 * and tags are fields of the asset and follow its rights.
 */
export function createTrackedNote(deps: TrackedNoteDeps) {
  return defineTrackedEntity({
    type: NOTE_ENTITY_TYPE,
    table: notes,
    baseSchema: NoteBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    // The same text means something else in another format.
    groups: [["contentFormat", "content"]],
    access: campaignHistoryAccess<NoteRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      noteType: field.value(),
      contentFormat: field.value(),
      // Long texts, so fewer versions are kept.
      content: field.value({ history: "low" }),
      gmNotes: field.value({ history: "low" }),
      sortOrder: field.position(),
      // Set once when the note is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    guard: async (next, _current, db) => {
      await deps.assertAssetChangeable(next.assetId, db);
    },
  });
}

export type TrackedNote = ReturnType<typeof createTrackedNote>;
