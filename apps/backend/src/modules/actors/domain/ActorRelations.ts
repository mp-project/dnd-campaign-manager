import { z } from "zod";

import type { AssetRelationDefinition } from "#src/modules/asset-links/index";

/**
 * Placeholder for the faction module: an actor belongs to a faction, with its role there
 * ("leader", "spy"). Factions get their own module and content type later; until then the relation
 * is known, so links can be set to `FACTION` assets and nothing about factions is stored on the
 * actor. The faction module may take over the registration.
 */
export const MEMBER_OF_RELATION: AssetRelationDefinition = {
  type: "MEMBER_OF",
  sourceTypes: ["ACTOR"],
  targetTypes: ["FACTION"],
  metadataSchema: z.strictObject({
    role: z.string().trim().min(1).max(160).nullable().default(null),
  }),
  playerVisible: true,
};
