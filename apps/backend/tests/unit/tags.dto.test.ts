import { normalizeTagName } from "#src/modules/tags/domain/dto/BaseTagDto";
import { CreateTagSchema } from "#src/modules/tags/domain/dto/CreateTagDto";
import { RequestDeleteTagQuerySchema } from "#src/modules/tags/domain/dto/RequestTagDto";
import {
  ReplaceAssetTagsSchema,
  UpdateTagSchema,
} from "#src/modules/tags/domain/dto/UpdateTagDto";

const TAG = "f0000000-0000-4000-8000-000000000001";

describe("tag names", () => {
  it.each([
    ["  Boss  Fight ", "boss fight"],
    ["STRASSE", "strasse"],
    ["Straße", "strasse"],
    ["ΣΊΣΥΦΟΣ", "σίσυφος"],
    ["σίσυφος", "σίσυφος"],
    ["Café", "café"],
    ["Café", "café"],
    ["ﬁre", "fire"],
    ["Ｆｕｌｌ", "full"],
  ])("normalizes %j to %j", (name, normalized) => {
    expect(normalizeTagName(name)).toBe(normalized);
  });

  it("rejects names that normalize to nothing or become too long", () => {
    expect(CreateTagSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: "ß".repeat(41) }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: "ß".repeat(40) }).success).toBe(true);
  });
});

describe("tag DTOs", () => {
  it.each(["#fff", "#GGGGGG", "red", "#1234567", "#12345678a"])("rejects the color %s", (color) => {
    expect(CreateTagSchema.safeParse({ name: "Boss", color }).success).toBe(false);
  });

  it.each(["#a1B2c3", "#a1B2c3D4"])("accepts the color %s", (color) => {
    expect(CreateTagSchema.safeParse({ name: "Boss", color }).success).toBe(true);
  });

  it("does not accept fields the client may not set", () => {
    expect(CreateTagSchema.safeParse({ name: "Boss", campaignId: TAG }).success).toBe(false);
    expect(CreateTagSchema.safeParse({ name: "Boss", normalizedName: "x" }).success).toBe(false);
  });

  it("needs at least one field and a version on update", () => {
    expect(UpdateTagSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(UpdateTagSchema.safeParse({ name: "Boss" }).success).toBe(false);
    expect(UpdateTagSchema.safeParse({ color: null, expectedVersion: 1 }).success).toBe(true);
  });

  it("limits a replacement to 100 unique tags", () => {
    const parse = (tagIds: string[]) =>
      ReplaceAssetTagsSchema.safeParse({ tagIds, expectedVersion: 1 }).success;

    expect(parse([])).toBe(true);
    expect(parse([TAG, TAG])).toBe(false);
    expect(parse(["nope"])).toBe(false);
    expect(
      parse(
        Array.from(
          { length: 101 },
          (_, index) => `f0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
      ),
    ).toBe(false);
  });

  it("reads forceDetach by value", () => {
    expect(RequestDeleteTagQuerySchema.parse({ forceDetach: "false" }).forceDetach).toBe(false);
    expect(RequestDeleteTagQuerySchema.parse({ forceDetach: "true" }).forceDetach).toBe(true);
    expect(RequestDeleteTagQuerySchema.parse({}).forceDetach).toBe(false);
  });
});
