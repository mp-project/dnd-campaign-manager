import type { Directive } from "vue";

import { useReducedMotion } from "@/core/motion/reducedMotion";

/**
 * `v-reveal`: the element glides into view the first time it enters the window. Only elements
 * still below the window when the page mounts take part, so nothing already visible flickers; a
 * missing IntersectionObserver or reduced motion shows everything at once. The look lives in
 * `.reveal` / `.is-revealed` (`main.css`); `--reveal-delay` staggers siblings.
 */
let observer: IntersectionObserver | undefined;
const reducedMotion = useReducedMotion();

function sharedObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-revealed");
        observer?.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  return observer;
}

export const vReveal: Directive<HTMLElement, number | undefined> = {
  mounted(el, binding) {
    if (typeof IntersectionObserver === "undefined") return;
    if (reducedMotion.value) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    if (binding.value) el.style.setProperty("--reveal-delay", `${binding.value}ms`);
    el.classList.add("reveal");
    sharedObserver().observe(el);
  },
  beforeUnmount(el) {
    observer?.unobserve(el);
  },
};
