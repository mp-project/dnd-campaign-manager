import { type Directive, watch } from "vue";

import { gsap, motionDuration, motionEase, ScrollTrigger } from "./gsap";
import { useReducedMotion } from "./reducedMotion";

/**
 * `v-reveal`: the element moves into view the first time it scrolls into the window, clearly
 * visible: from below (default), from the `left` or `right`, or growing (`zoom`). The value is a
 * delay in ms (`v-reveal="120"`, to stagger siblings) or `{ from, delay }`. Only elements still
 * below the window when the page mounts take part, so nothing already visible flickers; with
 * reduced motion everything shows at once, also elements still waiting.
 */
export type RevealFrom = "below" | "left" | "right" | "zoom";
export type RevealOptions = { from?: RevealFrom; delay?: number };
type RevealValue = number | RevealOptions | undefined;

/** Where an element starts; it ends at its own place, fully opaque. */
const START: Record<RevealFrom, gsap.TweenVars> = {
  below: { y: 90, scale: 0.96 },
  left: { x: -110 },
  right: { x: 110 },
  zoom: { scale: 0.82 },
};
const END: gsap.TweenVars = { x: 0, y: 0, scale: 1, autoAlpha: 1 };
/** Inline styles the reveal sets; a CSS transition of the element (hover) would fight the tween. */
const CLEAR = "transform,opacity,visibility,transition";

const waiting = new Map<HTMLElement, ScrollTrigger>();
const reducedMotion = useReducedMotion();

function options(value: RevealValue): Required<RevealOptions> {
  if (typeof value === "number") return { from: "below", delay: value };
  return { from: value?.from ?? "below", delay: value?.delay ?? 0 };
}

function show(el: HTMLElement): void {
  waiting.get(el)?.kill();
  waiting.delete(el);
  gsap.killTweensOf(el);
  gsap.set(el, { clearProps: CLEAR });
}

export const vReveal: Directive<HTMLElement, RevealValue> = {
  mounted(el, binding) {
    if (reducedMotion.value) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    const { from, delay } = options(binding.value);

    gsap.set(el, { ...START[from], autoAlpha: 0, transition: "none" });
    const trigger = ScrollTrigger.create({
      trigger: el,
      start: "top 88%",
      once: true,
      onEnter: () => {
        waiting.delete(el);
        gsap.to(el, {
          ...END,
          delay: delay / 1000,
          duration: motionDuration("reveal"),
          ease: motionEase("out"),
          clearProps: CLEAR,
        });
      },
    });
    waiting.set(el, trigger);
  },
  beforeUnmount(el) {
    waiting.get(el)?.kill();
    waiting.delete(el);
    gsap.killTweensOf(el);
  },
};

// Reduced motion switched on while elements still wait: show them, don't leave them hidden.
watch(reducedMotion, (reduced) => {
  if (reduced) for (const el of [...waiting.keys()]) show(el);
});
