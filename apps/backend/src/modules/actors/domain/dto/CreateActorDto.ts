import { z } from "zod";

import { ActorBaseSchema } from "#src/modules/actors/domain/dto/BaseActorDto";
import { CreateAssetLinkSchema } from "#src/modules/asset-links/index";
import { AssetEditableStatusSchema } from "#src/modules/assets/index";

/**
 * Asset, actor, tags and links are created in one transaction. Parts that are not sent start empty
 * (abilities at 10, a walking speed of 30 feet). Links start at the new actor; they are changed later
 * through the asset-links routes.
 */
export const CreateActorSchema = ActorBaseSchema.pick({ name: true, category: true })
  .extend(
    ActorBaseSchema.pick({
      summary: true,
      displayName: true,
      size: true,
      creatureType: true,
      creatureSubtype: true,
      alignment: true,
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
      loot: true,
      tagIds: true,
    }).partial().shape,
  )
  .extend({
    status: AssetEditableStatusSchema.default("ACTIVE"),
    relatedLinks: z.array(CreateAssetLinkSchema).max(50).optional(),
  });

export type CreateActorDto = z.infer<typeof CreateActorSchema>;
