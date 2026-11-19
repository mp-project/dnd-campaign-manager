import { onBeforeUnmount, onMounted, type Ref, watch } from "vue";

import { gsap } from "./gsap";
import { useReducedMotion } from "./reducedMotion";

/**
 * GSAP for one component: `setup` runs after mounting inside a `gsap.context` scoped to `scope`
 * (selector text finds only the component's own elements), and everything it created is reverted
 * on unmount. `reduced` says whether to move at all: with reduced motion `setup` sets the end
 * state instead of animating. When the setting changes, the context is reverted and `setup` runs
 * again. A function returned from `setup` runs on revert (timers, listeners, animations started
 * later outside the context).
 */
export function useGsap(
  scope: Ref<HTMLElement | undefined | null>,
  setup: (state: { reduced: boolean }) => void | (() => void),
): void {
  const reducedMotion = useReducedMotion();
  let context: gsap.Context | undefined;
  let stop: (() => void) | undefined;

  function build(): void {
    context?.revert();
    if (!scope.value) return;
    context = gsap.context(() => setup({ reduced: reducedMotion.value }), scope.value);
  }

  onMounted(() => {
    build();
    stop = watch(reducedMotion, build);
  });
  onBeforeUnmount(() => {
    stop?.();
    context?.revert();
    context = undefined;
  });
}
