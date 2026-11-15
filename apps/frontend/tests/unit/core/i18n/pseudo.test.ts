import { describe, expect, it } from "vitest";

import { pseudoLocalize, pseudoLocalizeMessage } from "@/core/i18n/pseudo";

describe("pseudo language", () => {
  it("accents, lengthens and brackets text so hard-coded and tight text shows", () => {
    const message = pseudoLocalizeMessage("Ort erstellen");

    expect(message).toMatch(/^\[Ó.*~+\]$/);
    expect(message.length).toBeGreaterThan("[Ort erstellen]".length + 4);
  });

  it("keeps placeholders, linked messages and plural forms working", () => {
    const message = pseudoLocalizeMessage("Keine Einträge | Ein Eintrag | {count} Einträge @:common.app.name");

    expect(message.split(" | ")).toHaveLength(3);
    expect(message).toContain("{count}");
    expect(message).toContain("@:common.app.name");
    for (const form of message.split(" | ")) expect(form).toMatch(/^\[.*\]$/);
  });

  it("converts every message of a tree", () => {
    expect(pseudoLocalize({ a: { b: "Speichern" } })).toEqual({ a: { b: pseudoLocalizeMessage("Speichern") } });
  });
});
