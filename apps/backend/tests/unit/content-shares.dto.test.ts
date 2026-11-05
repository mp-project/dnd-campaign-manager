import { CreateContentShareSchema } from "#src/modules/content-shares/domain/dto/CreateContentShareDto";
import { RequestContentSharesQuerySchema } from "#src/modules/content-shares/domain/dto/RequestContentShareDto";
import { UpdateContentShareSchema } from "#src/modules/content-shares/domain/dto/UpdateContentShareDto";

const A = "f0000000-0000-4000-8000-000000000001";
const B = "f0000000-0000-4000-8000-000000000002";
const FUTURE = "2099-01-01T00:00:00.000Z";

describe("content share DTOs", () => {
  it.each([
    [{ assetId: A, audience: "ALL_PLAYERS" }, true],
    [{ assetId: A, audience: "ALL_PLAYERS", recipientMemberIds: [] }, true],
    [{ assetId: A, audience: "ALL_PLAYERS", recipientMemberIds: [B] }, false],
    [{ assetId: A, audience: "SELECTED_PLAYERS" }, false],
    [{ assetId: A, audience: "SELECTED_PLAYERS", recipientMemberIds: [] }, false],
    [{ assetId: A, audience: "SELECTED_PLAYERS", recipientMemberIds: [B] }, true],
    [{ assetId: A, audience: "SELECTED_PLAYERS", recipientMemberIds: [B, B] }, false],
    [{ assetId: A, audience: "ALL_PLAYERS", expiresAt: FUTURE }, true],
    [{ assetId: A, audience: "ALL_PLAYERS", expiresAt: null }, true],
    [{ assetId: A, audience: "ALL_PLAYERS", expiresAt: "tomorrow" }, false],
    [{ assetId: A, audience: "EVERYONE" }, false],
    [{ assetId: A, audience: "ALL_PLAYERS", campaignId: B }, false],
    [{ assetId: A, audience: "ALL_PLAYERS", sharedAt: FUTURE }, false],
  ])("checks a new share: %j", (payload, valid) => {
    expect(CreateContentShareSchema.safeParse(payload).success).toBe(valid);
  });

  it("needs at least one field and a version for an update", () => {
    expect(UpdateContentShareSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(UpdateContentShareSchema.safeParse({ expiresAt: null }).success).toBe(false);
    expect(UpdateContentShareSchema.safeParse({ expiresAt: null, expectedVersion: 1 }).success).toBe(true);
    expect(UpdateContentShareSchema.safeParse({ assetId: A, expectedVersion: 1 }).success).toBe(false);
  });

  it("takes an optional point in time for new shares", () => {
    expect(RequestContentSharesQuerySchema.parse({ since: FUTURE })).toMatchObject({ since: FUTURE, limit: 20 });
    expect(RequestContentSharesQuerySchema.safeParse({ since: "yesterday" }).success).toBe(false);
  });
});
