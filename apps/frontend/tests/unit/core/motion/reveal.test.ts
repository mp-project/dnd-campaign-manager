import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, withDirectives } from "vue";

import { gsap, ScrollTrigger } from "@/core/motion/gsap";
import { setUserReducedMotion } from "@/core/motion/reducedMotion";
import { type RevealOptions, vReveal } from "@/core/motion/reveal";

type TriggerVars = { trigger: Element; onEnter?: () => void };

/** ScrollTrigger can't measure in jsdom; the test enters the window itself. */
function captureTriggers(): TriggerVars[] {
  const created: TriggerVars[] = [];
  vi.spyOn(ScrollTrigger, "create").mockImplementation((vars) => {
    created.push(vars as TriggerVars);
    return { kill: vi.fn() } as unknown as ScrollTrigger;
  });
  return created;
}

function mountAt(top: number, value?: number | RevealOptions) {
  const Host = defineComponent({
    render: () => withDirectives(h("div"), [[vReveal, value]]),
  });
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { ...original.call(this), top } as DOMRect;
  });
  return mount(Host, { attachTo: document.body });
}

/** Runs the reveal tween to its end. */
function finish(el: Element): void {
  for (const tween of gsap.getTweensOf(el)) tween.progress(1);
}

beforeEach(() => setUserReducedMotion(false));
afterEach(() => {
  vi.restoreAllMocks();
  setUserReducedMotion(false);
});

describe("v-reveal", () => {
  it("hides an element below the window and moves it in once it is seen", () => {
    const triggers = captureTriggers();
    const wrapper = mountAt(window.innerHeight + 200, { from: "left", delay: 120 });
    const el = wrapper.element as HTMLElement;

    expect(el.style.opacity).toBe("0");
    expect(el.style.visibility).toBe("hidden");
    expect(triggers).toHaveLength(1);
    expect(triggers[0]!.trigger).toBe(el);

    triggers[0]!.onEnter!();
    const [tween] = gsap.getTweensOf(el);
    expect(tween?.delay()).toBeCloseTo(0.12);
    finish(el);

    expect(el.style.opacity).toBe("");
    expect(el.style.visibility).toBe("");
    expect(el.style.transform).toBe("");
    wrapper.unmount();
  });

  it("leaves what is already in view alone", () => {
    const triggers = captureTriggers();
    const wrapper = mountAt(100);
    expect((wrapper.element as HTMLElement).style.opacity).toBe("");
    expect(triggers).toHaveLength(0);
    wrapper.unmount();
  });

  it("moves nothing with reduced motion, and shows what still waits when it is switched on", async () => {
    captureTriggers();
    const waiting = mountAt(window.innerHeight + 200);
    expect((waiting.element as HTMLElement).style.opacity).toBe("0");

    setUserReducedMotion(true);
    await nextTick();
    expect((waiting.element as HTMLElement).style.opacity).toBe("");

    const later = mountAt(window.innerHeight + 200);
    expect((later.element as HTMLElement).style.opacity).toBe("");
    waiting.unmount();
    later.unmount();
  });
});
