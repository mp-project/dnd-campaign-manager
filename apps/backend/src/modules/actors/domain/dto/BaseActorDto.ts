import { z } from "zod";

import { uuidDto } from "#core/http/dto";
import { ActorPartsSchema } from "#src/modules/actors/domain/dto/ActorPartsDto";
import {
  ACTOR_CATEGORIES,
  ACTOR_DESCRIPTION_MAX_LENGTH,
  ACTOR_DISPLAY_NAME_MAX_LENGTH,
  ACTOR_NOTES_MAX_LENGTH,
  ACTOR_SIZES,
  ACTOR_SUBTYPE_MAX_LENGTH,
  ALIGNMENTS,
  CREATURE_TYPES,
} from "#src/modules/actors/domain/entities/ActorsTable";
import { AssetBaseSchema } from "#src/modules/assets/index";

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();

/**
 * All actor fields with their validation rules, including the asset fields an actor shows as its own
 * (`name` is the title of the asset). Request and response DTOs derive their fields from this schema
 * via `pick`.
 */
export const ActorBaseSchema = z.strictObject({
  id: uuidDto,
  assetId: uuidDto,
  campaignId: uuidDto,
  name: AssetBaseSchema.shape.title,
  summary: AssetBaseSchema.shape.summary,
  status: AssetBaseSchema.shape.status,
  category: z.enum(ACTOR_CATEGORIES),
  displayName: nullableText(ACTOR_DISPLAY_NAME_MAX_LENGTH),
  size: z.enum(ACTOR_SIZES),
  creatureType: z.enum(CREATURE_TYPES).nullable(),
  creatureSubtype: nullableText(ACTOR_SUBTYPE_MAX_LENGTH),
  alignment: z.enum(ALIGNMENTS).nullable(),
  /** Markdown; only the rendered `descriptionHtml` of a response is HTML. */
  description: nullableText(ACTOR_DESCRIPTION_MAX_LENGTH),
  notes: nullableText(ACTOR_NOTES_MAX_LENGTH),
  /** Raw text for GMs and editors, never rendered as HTML. */
  gmNotes: nullableText(ACTOR_NOTES_MAX_LENGTH),
  ...ActorPartsSchema.shape,
  tagIds: z
    .array(uuidDto)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, { message: "Tag ids must be unique" }),
});

export type ActorBaseDto = z.infer<typeof ActorBaseSchema>;
export type ActorCategory = ActorBaseDto["category"];
