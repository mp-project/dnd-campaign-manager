import { toAuditActorId } from "#core/db/auditActor";
import { SYSTEM_USER_ID } from "#core/db/schemaHelpers";

describe("toAuditActorId", () => {
  it("keeps a valid UUID", () => {
    const actorId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

    expect(toAuditActorId(actorId)).toBe(actorId);
  });

  it.each(["admin-rollback", "", null, undefined])("falls back to the system user for %p", (actorId) => {
    expect(toAuditActorId(actorId)).toBe(SYSTEM_USER_ID);
  });
});
