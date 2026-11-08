import { SYSTEM_USER_ID } from "#core/db/schemaHelpers";
import { RFC_UUID_PATTERN } from "#core/uuid";

const uuidPattern = RFC_UUID_PATTERN;

/**
 * Value for `createdBy`/`updatedBy`: the actor if it is a valid UUID, otherwise the system user.
 */
export function toAuditActorId(actorId?: string | null): string {
  if (typeof actorId === "string" && uuidPattern.test(actorId)) {
    return actorId;
  }

  return SYSTEM_USER_ID;
}
