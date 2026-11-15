import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { checkCatalog, renderTypes } from "../../../../scripts/i18nCatalog";

const GLOSSARY = {
  terms: Object.fromEntries(
    [
      "abilityScores", "armorClass", "background", "cantrip", "class", "condition", "feat", "hitPoints",
      "initiative", "proficiencyBonus", "savingThrow", "skill", "species", "spell", "spellSlot", "subclass",
    ].map((term) => [term, term]),
  ),
  editions: { "2014": { species: "Race" } },
};

let dir: string;

function project(files: Record<string, unknown>): string {
  dir = mkdtempSync(join(tmpdir(), "i18n-"));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

const base = {
  "locales/de/glossary.json": GLOSSARY,
  "locales/en/glossary.json": GLOSSARY,
};

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("message catalog check", () => {
  it("accepts matching languages and module files", () => {
    const src = project({
      ...base,
      "locales/de/common.json": { save: "Speichern", count: "{count} Einträge" },
      "locales/en/common.json": { save: "Save", count: "{count} entries" },
      "modules/locations/locales/de.json": { title: "Orte" },
      "modules/locations/locales/en.json": { title: "Locations" },
      "modules/locations/views/List.vue": `<script setup lang="ts">t("locations.title"); t("common.save"); t("common.count")</script>`,
    });

    expect(checkCatalog(src)).toEqual({ errors: [], warnings: [] });
  });

  it("refuses missing and extra keys, other placeholders and keys the source uses but German lacks", () => {
    const src = project({
      ...base,
      "locales/de/common.json": { save: "Speichern", count: "{count} Einträge" },
      "locales/en/common.json": { count: "{total} entries", extra: "Extra" },
      "app.ts": `t("common.missing")`,
    });

    expect(checkCatalog(src).errors).toEqual(
      expect.arrayContaining([
        'en: missing "common.save"',
        'en: "common.count" must use the placeholders {count}',
        'en: "common.extra" is not in de',
        'source uses "common.missing", which de doesn\'t define',
      ]),
    );
  });

  it("checks the glossary terms and edition overrides", () => {
    const src = project({
      "locales/de/glossary.json": { terms: {}, editions: { "1999": { dragon: "Drache" } } },
      "locales/en/glossary.json": { terms: {}, editions: {} },
    });

    expect(checkCatalog(src).errors).toEqual(
      expect.arrayContaining([
        'de: glossary term "species" is missing',
        'de: glossary edition "1999" is unknown',
        'de: glossary override "1999.dragon" names no glossary term',
      ]),
    );
  });

  it("warns about unused keys unless they are declared as built at runtime", () => {
    const src = project({
      ...base,
      "locales/de/errors.json": { NOT_FOUND: "Nicht gefunden" },
      "locales/en/errors.json": { NOT_FOUND: "Not found" },
      "locales/de/common.json": { unused: "Weg" },
      "locales/en/common.json": { unused: "Gone" },
      "core.ts": "// i18n-dynamic: errors.*",
    });

    expect(checkCatalog(src).warnings).toEqual(['unused "common.unused"']);
  });

  it("counts keys passed on as data as used, without checking other dotted strings", () => {
    const src = project({
      ...base,
      "locales/de/common.json": { nav: { world: "Welt" } },
      "locales/en/common.json": { nav: { world: "World" } },
      "modules/locations/index.ts": `export const nav = { label: "common.nav.world", file: "main.css" };`,
    });

    expect(checkCatalog(src)).toEqual({ errors: [], warnings: [] });
  });

  it("derives the message types from the German files", () => {
    const src = project({ ...base, "locales/de/common.json": {}, "modules/notes/locales/de.json": {} });

    const types = renderTypes(src, join(src, "core/i18n/generated/messages.d.ts"));

    expect(types).toContain('"common": typeof import("../../../locales/de/common.json");');
    expect(types).toContain('"notes": typeof import("../../../modules/notes/locales/de.json");');
  });
});

describe("message syntax", () => {
  it("refuses messages vue-i18n can't compile", () => {
    const src = project({
      ...base,
      "locales/de/common.json": { greet: "Hallo {name" },
      "locales/en/common.json": { greet: "Hello {name}" },
      "app.ts": `t("common.greet")`,
    });

    expect(checkCatalog(src).errors).toEqual(
      expect.arrayContaining([expect.stringMatching(/^de: "common.greet" doesn't compile/)]),
    );
  });
});
