import { z } from "zod";

import { baseEntityResponseDto, standardListResponseDto } from "#core/http/dto";
import { createStandardListResponse, encodePaginationCursor } from "#core/http/listResponse";
import { renderSafeMarkdown } from "#core/text/safeMarkdown";
import {
  CarriedItemLootSchema,
  CurrencyLootSchema,
  PlannedItemLootSchema,
  TextLootSchema,
} from "#src/modules/actors/domain/dto/ActorPartsDto";
import { ActorBaseSchema } from "#src/modules/actors/domain/dto/BaseActorDto";
import type { ActorPage, ActorRecord, ActorWithAsset } from "#src/modules/actors/domain/repository/ActorsRepository";
import { readActorParts } from "#src/modules/actors/history/TrackedActor";

/** HTML rendered by the server from Markdown; raw HTML and script links never get through. */
const htmlDto = z.string().nullable();

/**
 * A loot entry with `available`: false when a carried item is no longer the actor's (given away,
 * merged or deleted). Other entries are always available.
 */
const available = { available: z.boolean() };

export const ResponseLootEntrySchema = z.discriminatedUnion("kind", [
  CarriedItemLootSchema.extend(available),
  PlannedItemLootSchema.extend(available),
  CurrencyLootSchema.extend(available),
  TextLootSchema.extend(available),
]);

const SUMMARY_FIELDS = {
  assetId: true,
  campaignId: true,
  name: true,
  summary: true,
  status: true,
  category: true,
  displayName: true,
  size: true,
  creatureType: true,
  creatureSubtype: true,
  alignment: true,
  tagIds: true,
} as const;

/**
 * View for GMs and editors with every part. `version` and the audit fields belong to the actor,
 * `assetVersion` to its asset; changes send both back.
 */
export const ResponseActorFullSchema = baseEntityResponseDto
  .extend(
    ActorBaseSchema.pick({
      ...SUMMARY_FIELDS,
      description: true,
      notes: true,
      gmNotes: true,
      abilities: true,
      skills: true,
      proficiencies: true,
      languages: true,
      senses: true,
      speeds: true,
      defenses: true,
      combat: true,
      traits: true,
      appearance: true,
      personality: true,
      wallet: true,
    }).shape,
  )
  .extend({
    view: z.literal("FULL"),
    assetVersion: z.number().int().positive(),
    descriptionHtml: htmlDto,
    loot: z.array(ResponseLootEntrySchema),
  });

/** `merged` lists fields whose newer value from somebody else was kept instead of the sent one. */
export const ResponseUpdateActorSchema = ResponseActorFullSchema.extend({
  merged: z.array(z.string()),
});

/**
 * View for players, also the content of a share: who the actor is and how it looks, nothing of its
 * values, notes, personality, wallet or loot. Strict, so nothing else can leave the server.
 */
export const ResponseActorPlayerSchema = ActorBaseSchema.pick({
  id: true,
  assetId: true,
  name: true,
  summary: true,
  category: true,
  displayName: true,
  size: true,
  creatureType: true,
  creatureSubtype: true,
  alignment: true,
  description: true,
  appearance: true,
}).extend({
  view: z.literal("PLAYER"),
  descriptionHtml: htmlDto,
});

export const ResponseActorSchema = z.discriminatedUnion("view", [
  ResponseActorFullSchema,
  ResponseActorPlayerSchema,
]);

/** List entry for GMs and editors: everything to sort and pick an actor, no parts. */
export const ResponseActorListItemFullSchema = baseEntityResponseDto
  .extend(ActorBaseSchema.pick(SUMMARY_FIELDS).shape)
  .extend({ view: z.literal("FULL"), assetVersion: z.number().int().positive() });

export const ResponseActorListItemPlayerSchema = ResponseActorPlayerSchema.omit({
  alignment: true,
  description: true,
  descriptionHtml: true,
  appearance: true,
});

export const ResponseActorListSchema = standardListResponseDto(
  z.discriminatedUnion("view", [ResponseActorListItemFullSchema, ResponseActorListItemPlayerSchema]),
);

export type ResponseActorFullDto = z.infer<typeof ResponseActorFullSchema>;
export type ResponseUpdateActorDto = z.infer<typeof ResponseUpdateActorSchema>;
export type ResponseActorPlayerDto = z.infer<typeof ResponseActorPlayerSchema>;
export type ResponseActorDto = z.infer<typeof ResponseActorSchema>;
export type ResponseActorListDto = z.infer<typeof ResponseActorListSchema>;
export type ResponseActorListItemFullDto = z.infer<typeof ResponseActorListItemFullSchema>;
export type ResponseActorListItemPlayerDto = z.infer<typeof ResponseActorListItemPlayerSchema>;

const markdown = (text: string | null) => (text === null ? null : renderSafeMarkdown("MARKDOWN", text));

function auditOf({ actor }: ActorWithAsset) {
  return {
    id: actor.id,
    version: actor.version,
    createdAt: actor.createdAt.toISOString(),
    updatedAt: actor.updatedAt.toISOString(),
    deletedAt: actor.deletedAt?.toISOString() ?? null,
    createdBy: actor.createdBy,
    updatedBy: actor.updatedBy,
  };
}

/** What players may see in a list: who the actor is. */
function publicSummaryOf({ actor, asset }: ActorWithAsset) {
  return {
    id: actor.id,
    assetId: actor.assetId,
    name: asset.title,
    summary: asset.summary,
    category: actor.category,
    displayName: actor.displayName,
    size: actor.size,
    creatureType: actor.creatureType,
    creatureSubtype: actor.creatureSubtype,
  };
}

function summaryOf(found: ActorWithAsset) {
  return {
    ...publicSummaryOf(found),
    campaignId: found.actor.campaignId,
    status: found.asset.status,
    alignment: found.actor.alignment,
  };
}

/**
 * `ownedInstanceIds`: item instances the actor owns now, to mark carried loot that is gone.
 */
export function toActorFullResponse(
  record: ActorRecord,
  ownedInstanceIds: ReadonlySet<string>,
): ResponseActorFullDto {
  const { actor, asset, tagIds } = record;
  const parts = readActorParts(actor);
  const { loot, ...rest } = parts;

  return {
    view: "FULL",
    ...auditOf(record),
    ...summaryOf(record),
    assetVersion: asset.version,
    tagIds: [...tagIds].sort(),
    description: actor.description,
    descriptionHtml: markdown(actor.description),
    notes: actor.notes,
    gmNotes: actor.gmNotes,
    ...rest,
    loot: loot.map((entry) => ({
      ...entry,
      available: entry.kind !== "CARRIED_ITEM" || ownedInstanceIds.has(entry.itemInstanceId),
    })),
  };
}

export function toActorListItemFullResponse(record: ActorRecord): ResponseActorListItemFullDto {
  return {
    view: "FULL",
    ...auditOf(record),
    ...summaryOf(record),
    assetVersion: record.asset.version,
    tagIds: [...record.tagIds].sort(),
  };
}

export function toActorListItemPlayerResponse(found: ActorWithAsset): ResponseActorListItemPlayerDto {
  return { view: "PLAYER", ...publicSummaryOf(found) };
}

export function toActorPlayerResponse(found: ActorWithAsset): ResponseActorPlayerDto {
  return {
    view: "PLAYER",
    ...publicSummaryOf(found),
    alignment: found.actor.alignment,
    description: found.actor.description,
    descriptionHtml: markdown(found.actor.description),
    appearance: readActorParts(found.actor).appearance,
  };
}

export function toActorListResponse(params: {
  page: ActorPage;
  data: ResponseActorListDto["data"];
  limit: number;
}): ResponseActorListDto {
  const last = params.page.items.at(-1);

  return createStandardListResponse({
    data: params.data,
    limit: params.limit,
    nextCursor:
      params.page.hasMore && last
        ? encodePaginationCursor({ sortValue: last.asset.title, id: last.actor.id })
        : null,
  });
}
