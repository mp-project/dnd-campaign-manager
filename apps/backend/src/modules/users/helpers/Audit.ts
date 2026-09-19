const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SYSTEM_USER_ID = "00000000-0000-4000-8000-000000000001";

export function toAuditActorId(actorId?: string | null): string {
  if (typeof actorId === "string" && uuidPattern.test(actorId)) {
    return actorId;
  }

  return SYSTEM_USER_ID;
}
