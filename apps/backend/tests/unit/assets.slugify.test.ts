import { slugify } from "#src/modules/assets/index";

describe("asset slugs", () => {
  it("follows one rule for all assets", () => {
    expect(slugify("  Über die Brücke! ")).toBe("uber-die-brucke");
    expect(slugify("日本")).toBe("");
    expect(slugify("日本", { fallback: "note" })).toBe("note");
    expect(slugify("a".repeat(300))).toHaveLength(220);
  });

  it("adds a random suffix for names that may repeat", () => {
    const first = slugify("The Letter", { unique: true });

    expect(first).toMatch(/^the-letter-[0-9a-f]{8}$/);
    expect(slugify("The Letter", { unique: true })).not.toBe(first);
    expect(slugify("a".repeat(300), { unique: true })).toHaveLength(220);
    expect(slugify("日本", { unique: true, fallback: "note" })).toMatch(/^note-[0-9a-f]{8}$/);
  });
});
