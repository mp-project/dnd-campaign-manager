import type { AppDatabase } from "#core/db/pool";
import { ConflictError, ValidationError } from "#core/error/http/index";
import { campaignHistoryAccess } from "#core/history/campaignHistoryAccess";
import { defineTrackedEntity, field } from "#core/history/defineTrackedEntity";
import type { CampaignRole } from "#core/http/requestContext";
import { type ActorParts, ActorPartsSchema } from "#src/modules/actors/domain/dto/ActorPartsDto";
import { ActorBaseSchema } from "#src/modules/actors/domain/dto/BaseActorDto";
import { ACTOR_PARTS, actors } from "#src/modules/actors/domain/entities/ActorsTable";
import type { ActorRow } from "#src/modules/actors/domain/repository/ActorsRepository";
import { ASSET_ENTITY_TYPE } from "#src/modules/assets/index";

export const ACTOR_ENTITY_TYPE = "actor";

export const ACTOR_ACTIONS = {
  create: "actor.create",
  update: "actor.update",
  delete: "actor.delete",
  restore: "actor.restore",
} as const;

/** Actions that also change the asset; GMs may undo them there as well. */
export const ACTOR_ASSET_ACTIONS: readonly string[] = [
  ACTOR_ACTIONS.update,
  ACTOR_ACTIONS.delete,
  ACTOR_ACTIONS.restore,
];

type ParsableActorRow = Pick<ActorRow, (typeof ACTOR_PARTS)[number]>;

type TrackedActorDeps = {
  resolveRole(campaignId: string, actorId: string, db: AppDatabase): Promise<CampaignRole | null>;
  /**
   * Refuses changes to an actor whose asset is archived. References and item instances are checked
   * at the end of the action (`verifyContent`).
   */
  assertChangeable(row: ActorRow, db: AppDatabase): Promise<void>;
};

/** Parses the stored parts; throws 400 with all issues. */
export function parseActorParts(row: ParsableActorRow): ActorParts {
  const parsed = ActorPartsSchema.safeParse(
    Object.fromEntries(ACTOR_PARTS.map((part) => [part, row[part]])),
  );

  if (!parsed.success) {
    throw new ValidationError("Actor data is invalid", parsed.error.issues);
  }

  return parsed.data;
}

/** The parts for a read; parts that no longer parse are a conflict (409) until they are fixed. */
export function readActorParts(row: ParsableActorRow & { id?: string }): ActorParts {
  try {
    return parseActorParts(row);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ConflictError("The stored actor data is invalid", { actorId: row.id });
    }

    throw error;
  }
}

/** The parts, or null when they no longer parse. */
export function tryParseActorParts(row: ParsableActorRow): ActorParts | null {
  try {
    return parseActorParts(row);
  } catch {
    return null;
  }
}

/**
 * History rules of actors: GMs and editors change them, so only they read the history. Name,
 * summary, status and tags are fields of the asset and follow its rights. Every part is its own
 * field, so two people changing different parts at once don't conflict.
 */
export function createTrackedActor(deps: TrackedActorDeps) {
  return defineTrackedEntity({
    type: ACTOR_ENTITY_TYPE,
    table: actors,
    baseSchema: ActorBaseSchema,
    campaignId: (row) => row.campaignId,
    root: (row) => ({ type: ASSET_ENTITY_TYPE, id: row.assetId }),
    access: campaignHistoryAccess<ActorRow>({
      campaignId: (row) => row.campaignId,
      resolveRole: deps.resolveRole,
    }),
    fields: {
      category: field.value(),
      displayName: field.value(),
      size: field.value(),
      creatureType: field.value(),
      creatureSubtype: field.value(),
      alignment: field.value(),
      // Long texts, so fewer versions are kept.
      description: field.value({ history: "low" }),
      notes: field.value({ history: "low" }),
      gmNotes: field.value({ history: "low" }),
      abilities: field.value(),
      skills: field.value(),
      proficiencies: field.value(),
      languages: field.value(),
      senses: field.value(),
      speeds: field.value(),
      defenses: field.value(),
      combat: field.value(),
      traits: field.value({ history: "low" }),
      appearance: field.value({ history: "low" }),
      personality: field.value({ history: "low" }),
      wallet: field.value(),
      loot: field.value(),
      // Set once when the actor is created.
      campaignId: field.ignore(),
      assetId: field.ignore(),
    },
    validate: (next) => {
      parseActorParts(next);
    },
    guard: async (next, _current, db) => {
      await deps.assertChangeable(next, db);
    },
  });
}

export type TrackedActor = ReturnType<typeof createTrackedActor>;
