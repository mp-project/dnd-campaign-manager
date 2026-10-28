import { CreateAssetBaseSchema } from "#src/modules/assets/domain/dto/CreateAssetDto";
import {
  RequestCampaignAssetsQuerySchema,
  RequestCatalogParamsSchema,
} from "#src/modules/assets/domain/dto/RequestAssetDto";
import {
  ResponseAssetPlayerSchema,
  ResponseAssetSchema,
} from "#src/modules/assets/domain/dto/ResponseAssetDto";
import { UpdateAssetMetadataSchema } from "#src/modules/assets/domain/dto/UpdateAssetDto";

const assetId = "11111111-1111-4111-8111-111111111111";

describe("assets DTOs", () => {
  it("applies create defaults and rejects client-controlled identity fields", () => {
    expect(CreateAssetBaseSchema.parse({ assetType: "SPELL", title: "Fireball" })).toEqual({
      assetType: "SPELL",
      title: "Fireball",
      status: "DRAFT",
      rulesetPolicy: "NEUTRAL",
    });

    for (const field of ["id", "scope", "origin", "campaignId", "createdBy"]) {
      expect(
        CreateAssetBaseSchema.safeParse({ assetType: "SPELL", title: "Fireball", [field]: "x" })
          .success,
      ).toBe(false);
    }
  });

  it("validates title, slug and summary boundaries", () => {
    const base = { assetType: "NOTE", title: "A" };

    expect(CreateAssetBaseSchema.safeParse({ ...base, title: "" }).success).toBe(false);
    expect(CreateAssetBaseSchema.safeParse({ ...base, title: "x".repeat(200) }).success).toBe(true);
    expect(CreateAssetBaseSchema.safeParse({ ...base, title: "x".repeat(201) }).success).toBe(false);
    expect(CreateAssetBaseSchema.safeParse({ ...base, slug: "Not A Slug" }).success).toBe(false);
    expect(CreateAssetBaseSchema.safeParse({ ...base, summary: "x".repeat(501) }).success).toBe(
      false,
    );
    expect(CreateAssetBaseSchema.safeParse({ ...base, assetType: "GENERIC" }).success).toBe(false);
  });

  it("does not allow archiving through the metadata status field", () => {
    expect(CreateAssetBaseSchema.safeParse({ assetType: "NOTE", title: "A", status: "ARCHIVED" })
      .success).toBe(false);
    expect(UpdateAssetMetadataSchema.safeParse({ expectedVersion: 1, status: "ARCHIVED" }).success)
      .toBe(false);
  });

  it("requires expectedVersion and at least one field for metadata updates", () => {
    expect(UpdateAssetMetadataSchema.safeParse({ title: "New" }).success).toBe(false);
    expect(UpdateAssetMetadataSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(UpdateAssetMetadataSchema.safeParse({ expectedVersion: 1, title: "New" }).success).toBe(
      true,
    );
  });

  it("validates catalog params and list queries", () => {
    expect(RequestCatalogParamsSchema.safeParse({ assetType: "SPELL" }).success).toBe(true);
    expect(RequestCatalogParamsSchema.safeParse({ assetType: "spell" }).success).toBe(false);
    expect(RequestCampaignAssetsQuerySchema.parse({}).limit).toBe(20);
    expect(RequestCampaignAssetsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("keeps GM-only metadata out of the player response", () => {
    const player = {
      view: "PLAYER",
      id: assetId,
      assetType: "NPC",
      title: "Mira",
      summary: null,
      scope: "CAMPAIGN",
    };

    expect(ResponseAssetSchema.safeParse(player).success).toBe(true);
    expect(ResponseAssetPlayerSchema.safeParse({ ...player, status: "DRAFT" }).success).toBe(false);
    expect(ResponseAssetPlayerSchema.safeParse({ ...player, createdBy: assetId }).success).toBe(
      false,
    );
  });
});
