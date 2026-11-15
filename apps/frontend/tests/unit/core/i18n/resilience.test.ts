/* eslint-disable vue/one-component-per-file -- small probe components per test */
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { useFormat } from "@/core/i18n/format";
import { setTimeZone, timeZone } from "@/core/i18n/settings";

/*
 * Texts must never break the app: broken or missing messages fall back to German or show nothing,
 * a language that doesn't load falls back to German, and without any messages the app still runs.
 * The message files are replaced per test through the loader module.
 */

type Tree = Record<string, unknown>;

async function appWith(files: { de?: Tree | Error; en?: Tree | Error }, locale = "en") {
  vi.resetModules();
  vi.doMock("@/core/i18n/messages", () => ({
    loadMessages: async (requested: "de" | "en") => {
      const file = files[requested];
      if (!file || file instanceof Error) throw file ?? new Error("no file");
      return file;
    },
    loadPseudoMessages: async () => ({}),
  }));
  const { createAppI18n, setLocale, useAppI18n, useGlossary } = await import("@/core/i18n");
  const i18n = createAppI18n();
  const active = await setLocale(i18n, locale);
  let api: ReturnType<typeof useAppI18n> & ReturnType<typeof useGlossary> = undefined as never;
  const wrapper = mount(
    defineComponent({
      setup: () => {
        api = { ...useAppI18n(), ...useGlossary() };
        return () => h("p", api.t("common.actions.save" as never));
      },
    }),
    { global: { plugins: [i18n] } },
  );
  return { active, t: api.t as (key: string, ...rest: unknown[]) => string, term: api.term, wrapper };
}

afterEach(() => {
  vi.doUnmock("@/core/i18n/messages");
  vi.unstubAllEnvs();
});

describe("texts never break the app", () => {
  it("takes German when a message doesn't compile in the active language", async () => {
    const { t } = await appWith({
      de: { common: { greet: "Hallo {name}" } },
      en: { common: { greet: "Hello {name" } },
    });

    expect(t("common.greet", { name: "Lea" })).toBe("Hallo Lea");
  });

  it("shows nothing in production when no language has a usable message", async () => {
    vi.stubEnv("DEV", false);
    const { t, wrapper } = await appWith({ de: { common: { greet: "Hallo {name" } }, en: {} });

    expect(t("common.greet", { name: "Lea" })).toBe("");
    expect(t("common.unknown")).toBe("");
    expect(wrapper.text()).toBe("");
  });

  it("shows the key in development, so the gap is easy to find", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { t } = await appWith({ de: { common: { greet: "Hallo {name" } }, en: {} });

    expect(t("common.greet")).toBe("common.greet");
    warn.mockRestore();
  });

  it("falls back to German when the language can't be loaded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { active, t } = await appWith({ de: { common: { actions: { save: "Speichern" } } }, en: new Error("offline") });

    expect(active).toBe("de");
    expect(t("common.actions.save")).toBe("Speichern");
  });

  it("still starts when no messages load at all", async () => {
    vi.stubEnv("DEV", false);
    const { wrapper } = await appWith({ de: new Error("offline"), en: new Error("offline") });

    expect(wrapper.html()).toBe("<p></p>");
  });

  it("names a glossary term in German (with the edition's wording) when the active language lacks it", async () => {
    const { term } = await appWith({
      de: { glossary: { terms: { species: "Spezies" }, editions: { "2014": { species: "Volk" } } } },
      en: { glossary: { terms: {}, editions: {} } },
    });

    expect(term("species")).toBe("Spezies");
    expect(term("species", "2014")).toBe("Volk");
  });
});

describe("formatting never throws", () => {
  const original = timeZone.value;
  afterEach(() => {
    timeZone.value = original;
  });

  it("ignores unknown time zones and shows nothing for invalid dates", async () => {
    vi.doUnmock("@/core/i18n/messages");
    vi.resetModules();
    const { createAppI18n, setLocale } = await import("@/core/i18n");
    const i18n = createAppI18n();
    await setLocale(i18n, "de");

    setTimeZone("Europe/Berlin");
    setTimeZone("Mars/Olympus_Mons");
    expect(timeZone.value).toBe("Europe/Berlin");

    timeZone.value = "Not/AZone";
    let format: ReturnType<typeof useFormat> = undefined as never;
    mount(defineComponent({ setup: () => { format = useFormat(); return () => h("div"); } }), {
      global: { plugins: [i18n] },
    });

    expect(format.date("2026-11-15T12:00:00Z")).toMatch(/2026/);
    expect(format.date("not a date")).toBe("");
    expect(format.relative("not a date")).toBe("");
  });
});
