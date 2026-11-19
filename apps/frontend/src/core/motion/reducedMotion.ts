import { computed, readonly, ref, type Ref, watchEffect } from "vue";

/**
 * Reduced motion, decided in one place for CSS, Vue transitions and scripts: the system setting
 * (`prefers-reduced-motion`) or the user's `reducedMotion` setting from the profile. While either
 * asks for it, `<html>` carries `data-reduced-motion`, which the central rule in `main.css` uses to
 * stop transitions and animations; scripts read `useReducedMotion()`.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

const system = ref(false);
const user = ref(false);
const reduced = computed(() => system.value || user.value);

let installed = false;

/** Follows the system setting and mirrors the decision on `<html>`. Call once at start, before mounting. */
export function installReducedMotion(): void {
  if (installed) return;
  installed = true;

  const media = typeof window.matchMedia === "function" ? window.matchMedia(QUERY) : null;
  if (media) {
    system.value = media.matches;
    media.addEventListener?.("change", (event) => (system.value = event.matches));
  }

  watchEffect(() => {
    document.documentElement.toggleAttribute("data-reduced-motion", reduced.value);
  });
}

/** The user's setting (`/me/settings`); `false` when signed out. */
export function setUserReducedMotion(value: boolean): void {
  user.value = value;
}

/** `true` while the system or the user asks for reduced motion. */
export function useReducedMotion(): Readonly<Ref<boolean>> {
  return readonly(reduced);
}
