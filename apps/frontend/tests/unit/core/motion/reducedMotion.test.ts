import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

type Listener = (event: { matches: boolean }) => void;

/** A system setting that can change while the page is open. */
function stubSystemSetting(matches: boolean): { change(value: boolean): void } {
  let listener: Listener | undefined;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches,
      addEventListener: (_type: string, callback: Listener) => (listener = callback),
    })),
  );
  return { change: (value) => listener?.({ matches: value }) };
}

async function load() {
  return import("@/core/motion/reducedMotion");
}

const marked = () => document.documentElement.hasAttribute("data-reduced-motion");

describe("reduced motion", () => {
  beforeEach(() => {
    vi.resetModules();
    document.documentElement.removeAttribute("data-reduced-motion");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows the system setting and marks <html>", async () => {
    const system = stubSystemSetting(false);
    const { installReducedMotion, useReducedMotion } = await load();
    installReducedMotion();
    const reduced = useReducedMotion();
    expect(reduced.value).toBe(false);
    expect(marked()).toBe(false);

    system.change(true);
    await nextTick();
    expect(reduced.value).toBe(true);
    expect(marked()).toBe(true);
  });

  it("applies the user's setting on top of the system setting", async () => {
    stubSystemSetting(false);
    const { installReducedMotion, setUserReducedMotion, useReducedMotion } = await load();
    installReducedMotion();

    setUserReducedMotion(true);
    await nextTick();
    expect(useReducedMotion().value).toBe(true);
    expect(marked()).toBe(true);

    setUserReducedMotion(false);
    await nextTick();
    expect(useReducedMotion().value).toBe(false);
    expect(marked()).toBe(false);
  });

  it("keeps reduced motion from the system when the user's setting is off", async () => {
    stubSystemSetting(true);
    const { installReducedMotion, setUserReducedMotion, useReducedMotion } = await load();
    installReducedMotion();
    setUserReducedMotion(false);
    await nextTick();
    expect(useReducedMotion().value).toBe(true);
    expect(marked()).toBe(true);
  });

  it("works where matchMedia is missing", async () => {
    vi.stubGlobal("matchMedia", undefined);
    const { installReducedMotion, useReducedMotion } = await load();
    installReducedMotion();
    expect(useReducedMotion().value).toBe(false);
  });
});
