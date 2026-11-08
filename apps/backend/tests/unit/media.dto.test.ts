import {
  AttachMediaSchema,
  UpdateAssetMediaSchema,
  CreateMediaUploadSchema,
} from "#src/modules/media/domain/dto/RequestMediaDto";
import { ResponseMediaFullSchema } from "#src/modules/media/domain/dto/ResponseMediaDto";
import { assertAltTextForPlayers } from "#src/modules/media/history/TrackedAssetMedia";

const MEDIA = "f0000000-0000-4000-8000-000000000001";

describe("media DTOs", () => {
  it("hides new assignments from players by default", () => {
    expect(AttachMediaSchema.parse({ mediaId: MEDIA, role: "COVER" })).toEqual({
      mediaId: MEDIA,
      role: "COVER",
      visibility: "GM_ONLY",
      isPrimary: false,
      displayOrder: 0,
    });
  });

  it.each([
    ["unknown role", { role: "PICTURE" }],
    ["unknown visibility", { visibility: "EVERYONE" }],
    ["negative order", { displayOrder: -1 }],
    ["alt text too long", { altText: "x".repeat(501) }],
    ["client-set campaign", { campaignId: MEDIA }],
  ])("rejects %s when attaching", (_name, change) => {
    expect(
      AttachMediaSchema.safeParse({ mediaId: MEDIA, role: "COVER", ...change }).success,
    ).toBe(false);
  });

  it("needs at least one field and a version on update, and cannot change the file", () => {
    expect(UpdateAssetMediaSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(UpdateAssetMediaSchema.safeParse({ title: "Map" }).success).toBe(false);
    expect(UpdateAssetMediaSchema.safeParse({ title: null, expectedVersion: 1 }).success).toBe(true);
    expect(
      UpdateAssetMediaSchema.safeParse({ mediaId: MEDIA, expectedVersion: 1 }).success,
    ).toBe(false);
  });

  it("only knows the announced file with title and alt text when starting an upload", () => {
    const file = { originalName: "map.png", mimeType: "image/png", sizeBytes: 12 };

    expect(CreateMediaUploadSchema.parse({ ...file, title: " Map " }).title).toBe("Map");
    expect(CreateMediaUploadSchema.safeParse({ ...file, title: "" }).success).toBe(false);
    expect(CreateMediaUploadSchema.safeParse({ ...file, sizeBytes: 0 }).success).toBe(false);
    expect(CreateMediaUploadSchema.safeParse({ ...file, other: "x" }).success).toBe(false);
  });

  it("never contains the storage key in a response", () => {
    expect(Object.keys(ResponseMediaFullSchema.shape)).not.toContain("storageKey");
  });
});

describe("alt text rule", () => {
  const rule = (isImage: boolean, visibility: "GM_ONLY" | "WITH_ASSET", altText: string | null) =>
    () => assertAltTextForPlayers({ isImage, visibility, altText });

  it("requires it only for images that players see", () => {
    expect(rule(true, "WITH_ASSET", null)).toThrow("alt text");
    expect(rule(true, "WITH_ASSET", "A map")).not.toThrow();
    expect(rule(true, "GM_ONLY", null)).not.toThrow();
    expect(rule(false, "WITH_ASSET", null)).not.toThrow();
  });
});
