import { SYSTEM_USER_ID } from "#core/db/schemaHelpers";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Value for `createdBy`/`updatedBy`: the actor if it is a valid UUID, otherwise the system user.
 */
export function toAuditActorId(actorId?: string | null): string {
  if (typeof actorId === "string" && uuidPattern.test(actorId)) {
    return actorId;
  }

  return SYSTEM_USER_ID;
}
