import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { NoteBaseSchema } from "#src/modules/notes/domain/dto/BaseNoteDto";
import { renderSafeMarkdown } from "#src/modules/notes/domain/NoteContent";
import type { NotePage, NoteRecord } from "#src/modules/notes/domain/repository/NotesRepository";

/** HTML rendered by the server from `content`; raw HTML and script links never get through. */
const contentHtmlDto = z.string();

/**
 * View for GMs and editors. `version` and the audit fields belong to the note, `assetVersion` to
 * its asset; changes send both back.
 */
export const ResponseNoteGmSchema = baseEntityResponseDto
  .extend(
    NoteBaseSchema.pick({
      assetId: true,
      campaignId: true,
      name: true,
      summary: true,
      status: true,
      noteType: true,
      contentFormat: true,
      content: true,
      gmNotes: true,
      sortOrder: true,
      tagIds: true,
    }).shape,
  )
  .extend({
    view: z.literal("GM"),
    assetVersion: z.number().int().positive(),
    contentHtml: contentHtmlDto,
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateNoteSchema = ResponseNoteGmSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players, also the content of a share. Strict, so nothing else can leave the server: no
 * GM notes, audit data, tags or links.
 */
export const ResponseNotePlayerSchema = NoteBaseSchema.pick({
  id: true,
  assetId: true,
  name: true,
  summary: true,
  noteType: true,
  contentFormat: true,
  content: true,
}).extend({
  view: z.literal("PLAYER"),
  contentHtml: contentHtmlDto,
});

export const ResponseNoteSchema = z.discriminatedUnion("view", [
  ResponseNoteGmSchema,
  ResponseNotePlayerSchema,
]);

/** List entry for GMs and editors: everything to sort and pick a note, but no text. */
export const ResponseNoteListItemGmSchema = ResponseNoteGmSchema.omit({
  content: true,
  contentHtml: true,
  gmNotes: true,
});

/** List entry for players; the text comes with the detail view. */
export const ResponseNoteListItemPlayerSchema = ResponseNotePlayerSchema.omit({
  content: true,
  contentHtml: true,
});

export const ResponseNoteListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseNoteListItemGmSchema, ResponseNoteListItemPlayerSchema]),
);

export type ResponseNoteGmDto = z.infer<typeof ResponseNoteGmSchema>;
export type ResponseUpdateNoteDto = z.infer<typeof ResponseUpdateNoteSchema>;
export type ResponseNotePlayerDto = z.infer<typeof ResponseNotePlayerSchema>;
export type ResponseNoteDto = z.infer<typeof ResponseNoteSchema>;
export type ResponseNoteListItemGmDto = z.infer<typeof ResponseNoteListItemGmSchema>;
export type ResponseNoteListItemPlayerDto = z.infer<typeof ResponseNoteListItemPlayerSchema>;
export type ResponseNoteListDto = z.infer<typeof ResponseNoteListSchema>;

export function toNoteGmResponse({ note, asset, tagIds }: NoteRecord): ResponseNoteGmDto {
  return {
    view: "GM",
    id: note.id,
    version: note.version,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    deletedAt: note.deletedAt?.toISOString() ?? null,
    createdBy: note.createdBy,
    updatedBy: note.updatedBy,
    assetId: note.assetId,
    assetVersion: asset.version,
    campaignId: note.campaignId,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    noteType: note.noteType,
    contentFormat: note.contentFormat,
    content: note.content,
    contentHtml: renderSafeMarkdown(note.contentFormat, note.content),
    gmNotes: note.gmNotes,
    sortOrder: note.sortOrder,
    tagIds: [...tagIds].sort(),
  };
}

export function toNoteListItemGmResponse(record: NoteRecord): ResponseNoteListItemGmDto {
  const { note, asset, tagIds } = record;

  return {
    view: "GM",
    id: note.id,
    version: note.version,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    deletedAt: note.deletedAt?.toISOString() ?? null,
    createdBy: note.createdBy,
    updatedBy: note.updatedBy,
    assetId: note.assetId,
    assetVersion: asset.version,
    campaignId: note.campaignId,
    name: asset.title,
    summary: asset.summary,
    status: asset.status,
    noteType: note.noteType,
    contentFormat: note.contentFormat,
    sortOrder: note.sortOrder,
    tagIds: [...tagIds].sort(),
  };
}

export function toNoteListItemPlayerResponse({
  note,
  asset,
}: Omit<NoteRecord, "tagIds">): ResponseNoteListItemPlayerDto {
  return {
    view: "PLAYER",
    id: note.id,
    assetId: note.assetId,
    name: asset.title,
    summary: asset.summary,
    noteType: note.noteType,
    contentFormat: note.contentFormat,
  };
}

export function toNotePlayerResponse({ note, asset }: Omit<NoteRecord, "tagIds">): ResponseNotePlayerDto {
  return {
    view: "PLAYER",
    id: note.id,
    assetId: note.assetId,
    name: asset.title,
    summary: asset.summary,
    noteType: note.noteType,
    contentFormat: note.contentFormat,
    content: note.content,
    contentHtml: renderSafeMarkdown(note.contentFormat, note.content),
  };
}

export function toNoteListResponse(params: {
  page: NotePage;
  data: ResponseNoteListDto["data"];
  limit: number;
}): ResponseNoteListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.note.sortOrder, id: last.note.id })
        : null,
  });
}
