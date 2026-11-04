import { CreateAssetLinkSchema } from "#src/modules/asset-links/domain/dto/CreateAssetLinkDto";
import { RequestAssetLinksQuerySchema } from "#src/modules/asset-links/domain/dto/RequestAssetLinkDto";
import { UpdateAssetLinkSchema } from "#src/modules/asset-links/domain/dto/UpdateAssetLinkDto";

const TARGET = "e0000000-0000-4000-8000-000000000001";

describe("asset link DTOs", () => {
  it("defaults the metadata and trims the label on create", () => {
    expect(
      CreateAssetLinkSchema.parse({
        targetAssetId: TARGET,
        relationType: "RELATED_TO",
        label: "  Door  ",
      }),
    ).toEqual({ targetAssetId: TARGET, relationType: "RELATED_TO", label: "Door", metadata: {} });
  });

  it.each([
    ["client-set campaign", { campaignId: TARGET }],
    ["lower-case relation", { relationType: "related_to" }],
    ["negative position", { sortOrder: -1 }],
    ["label too long", { label: "x".repeat(161) }],
    ["metadata that is no object", { metadata: [] }],
  ])("rejects %s on create", (_name, change) => {
    expect(
      CreateAssetLinkSchema.safeParse({
        targetAssetId: TARGET,
        relationType: "RELATED_TO",
        ...change,
      }).success,
    ).toBe(false);
  });

  it("needs at least one field and a version on update", () => {
    expect(UpdateAssetLinkSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(UpdateAssetLinkSchema.safeParse({ label: "Door" }).success).toBe(false);
    expect(UpdateAssetLinkSchema.safeParse({ label: null, expectedVersion: 1 }).success).toBe(true);
  });

  it.each([{ targetAssetId: TARGET }, { relationType: "OTHER" }])(
    "does not allow changing target or relation: %j",
    (change) => {
      expect(UpdateAssetLinkSchema.safeParse({ expectedVersion: 1, ...change }).success).toBe(false);
    },
  );

  it("only accepts known directions in the list query", () => {
    expect(RequestAssetLinksQuerySchema.safeParse({ direction: "incoming" }).success).toBe(true);
    expect(RequestAssetLinksQuerySchema.safeParse({ direction: "sideways" }).success).toBe(false);
  });
});
