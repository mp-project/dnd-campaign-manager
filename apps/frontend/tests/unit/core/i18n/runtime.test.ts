import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";

import { errorMessageKey } from "@/core/api/errors";
import { ApiError } from "@/core/api/errors";
import { createAppI18n, setLocale, useAppI18n, useGlossary } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";
import type { MessageKey } from "@/core/i18n/keys";
import { setTimeZone } from "@/core/i18n/settings";

/** Runs `use` inside a component with the app's i18n and returns what it produced. */
async function withI18n<T>(locale: string, use: () => T): Promise<T> {
  const i18n = createAppI18n();
  await setLocale(i18n, locale);
  let result: T | undefined;
  mount(defineComponent({ setup: () => { result = use(); return () => h("div"); } }), {
    global: { plugins: [i18n] },
  });
  return result as T;
}

describe("i18n runtime", () => {
  it("loads the requested language and remembers it", async () => {
    const { t } = await withI18n("en", () => useAppI18n());

    expect(t("common.actions.save")).toBe("Save");
    expect(t("common.results.count", 3, { count: 3 })).toBe("3 entries");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("chronik.locale")).toBe("en");
  });

  it("falls back to German for unsupported languages", async () => {
    const { t } = await withI18n("fr-FR", () => useAppI18n());

    expect(t("common.actions.save")).toBe("Speichern");
    expect(t("common.results.count", 1, { count: 1 })).toBe("Ein Eintrag");
  });

  it("translates API errors by code, never by the server's text", async () => {
    const { t } = await withI18n("de", () => useAppI18n());
    const error = new ApiError({ status: 412, code: "VERSION_CONFLICT", message: "The content was changed" });

    expect(t(errorMessageKey(error))).toBe("Jemand anderes hat das inzwischen geändert.");
    expect(t(errorMessageKey(new Error("boom")))).toBe("Unbekannter Fehler.");
  });

  it("names D&D terms in the wording of the ruleset edition", async () => {
    const de = await withI18n("de", () => useGlossary());
    expect(de.term("species", "2024")).toBe("Spezies");
    expect(de.term("species", "2014")).toBe("Volk");
    expect(de.term("savingThrow", "2014")).toBe("Rettungswurf");

    const en = await withI18n("en", () => useGlossary());
    expect(en.term("species", "2014")).toBe("Race");
    expect(en.term("proficiencyBonus")).toBe("Proficiency Bonus");
  });

  it("formats dates in the user's time zone and language", async () => {
    setTimeZone("Europe/Berlin");
    const de = await withI18n("de", () => useFormat());
    expect(de.date("2026-11-15T23:30:00Z", "dateTime")).toBe("16.11.2026, 00:30");
    expect(de.number(1234.5)).toBe("1.234,5");

    setTimeZone("America/New_York");
    const en = await withI18n("en", () => useFormat());
    expect(en.date("2026-11-15T23:30:00Z", "date")).toBe("Nov 15, 2026");
  });

  it("types message keys against the German files", () => {
    const key: MessageKey = "common.actions.save";
    // @ts-expect-error a typo in a key is a compile error
    const typo: MessageKey = "common.actions.sav";
    expect([key, typo]).toHaveLength(2);
  });
});
