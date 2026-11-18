import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, withDirectives } from "vue";

import { vReveal } from "@/modules/landing/reveal";

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;

function stubObserver(): { callbacks: Callback[]; observed: Element[] } {
  const state = { callbacks: [] as Callback[], observed: [] as Element[] };
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: Callback) {
        state.callbacks.push(callback);
      }
      observe(el: Element) {
        state.observed.push(el);
      }
      unobserve(el: Element) {
        state.observed = state.observed.filter((other) => other !== el);
      }
    },
  );
  return state;
}

function mountAt(top: number, delay?: number) {
  const Host = defineComponent({
    render: () => withDirectives(h("div"), [[vReveal, delay]]),
  });
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { ...original.call(this), top } as DOMRect;
  });
  return mount(Host, { attachTo: document.body });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("v-reveal", () => {
  it("lets an element below the window glide in once it is seen", () => {
    const state = stubObserver();
    const wrapper = mountAt(window.innerHeight + 200, 120);
    const el = wrapper.element as HTMLElement;
    expect(el.classList.contains("reveal")).toBe(true);
    expect(el.style.getPropertyValue("--reveal-delay")).toBe("120ms");
    expect(state.observed).toContain(el);
    state.callbacks.at(-1)!([{ isIntersecting: true, target: el }]);
    expect(el.classList.contains("is-revealed")).toBe(true);
    expect(state.observed).not.toContain(el);
    wrapper.unmount();
  });

  it("leaves what is already in view alone, and everything without an observer", () => {
    stubObserver();
    const visible = mountAt(100);
    expect(visible.element.classList.contains("reveal")).toBe(false);
    visible.unmount();

    vi.unstubAllGlobals();
    vi.stubGlobal("IntersectionObserver", undefined);
    const below = mountAt(window.innerHeight + 200);
    expect(below.element.classList.contains("reveal")).toBe(false);
    below.unmount();
  });
});
