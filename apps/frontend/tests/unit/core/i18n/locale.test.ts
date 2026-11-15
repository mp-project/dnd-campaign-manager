import { matchLocale, resolveLocale } from "@dnd/i18n";
import { describe, expect, it } from "vitest";

describe("language choice", () => {
  it("maps language tags to the shipped languages", () => {
    expect(matchLocale("de-AT")).toBe("de");
    expect(matchLocale("en_US")).toBe("en");
    expect(matchLocale("EN")).toBe("en");
    expect(matchLocale("fr-FR")).toBeNull();
    expect(matchLocale("")).toBeNull();
  });

  it("takes the first supported candidate in order of precedence, otherwise German", () => {
    // profile → stored choice → browser languages
    expect(resolveLocale([null, "en", "de-DE"])).toBe("en");
    expect(resolveLocale([undefined, null, "fr-FR", "en-GB"])).toBe("en");
    expect(resolveLocale(["fr", "es"])).toBe("de");
  });
});
