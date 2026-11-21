<script setup lang="ts">
/**
 * Header of the pages outside the app (start page, legal pages, sign-in): brand on the left,
 * actions in the default slot on the right. It stays at the top while the page scrolls and, once
 * the page has left the top, gets slimmer and lets the page shine through slightly. While it
 * shrinks, a bottom margin grows by the same amount, so the page below never moves: otherwise the
 * browser's scroll anchoring shifts the scroll position back over the threshold and the header
 * flickers between both states. Two thresholds (hysteresis) keep it calm near the top as well.
 * Its content keeps to the column of the public pages (1600 px). `condensed` fixes the state
 * (building blocks page) instead of following the scroll position.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

import BrandMark from "./BrandMark.vue";

withDefaults(defineProps<{ condensed?: boolean }>(), { condensed: undefined });
defineSlots<{ default?(): unknown }>();

/** Scroll distance in px after which the header condenses, and below which it opens again. */
const CONDENSE_AT = 24;
const EXPAND_BELOW = 8;

const scrolled = ref(false);
function update(): void {
  const y = window.scrollY;
  if (!scrolled.value && y > CONDENSE_AT) scrolled.value = true;
  else if (scrolled.value && y < EXPAND_BELOW) scrolled.value = false;
}
onMounted(() => {
  update();
  window.addEventListener("scroll", update, { passive: true });
});
onBeforeUnmount(() => window.removeEventListener("scroll", update));
</script>

<template>
  <header
    class="site-header sticky top-0 z-30 border-b border-navy-line"
    :class="{ 'is-condensed': condensed ?? scrolled }"
  >
    <div
      class="site-header-inner mx-auto flex max-w-400 items-center gap-2 px-4 md:px-10"
    >
      <BrandMark class="site-header-brand min-w-0" />
      <div
        v-if="$slots.default"
        class="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-6"
      >
        <slot />
      </div>
    </div>
  </header>
</template>

<style scoped>
.site-header {
  background-color: var(--color-navy-950);
}

.site-header-inner {
  padding-block: 1rem;
}

.site-header-brand {
  transform-origin: left center;
}

@media (min-width: 48rem) {
  .site-header-inner {
    padding-block: 1.5rem;
  }
}

/* The margin makes up for the padding the inner row loses (2 × (1rem − 0.375rem), from md on
   2 × (1.5rem − 0.5rem)), so the header takes the same room in the page in both states. */
.is-condensed {
  margin-bottom: 1.25rem;
  background-color: color-mix(in srgb, var(--color-navy-950) 85%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-soft);
}

@media (min-width: 48rem) {
  .is-condensed {
    margin-bottom: 2rem;
  }
}

.is-condensed .site-header-inner {
  padding-block: 0.375rem;
}

.is-condensed .site-header-brand {
  transform: scale(0.85);
}

@media (min-width: 48rem) {
  .is-condensed .site-header-inner {
    padding-block: 0.5rem;
  }
}

:root:not([data-reduced-motion]) .site-header,
:root:not([data-reduced-motion]) .site-header-inner,
:root:not([data-reduced-motion]) .site-header-brand {
  transition:
    padding 200ms ease,
    margin 200ms ease,
    transform 200ms ease,
    background-color 200ms ease,
    box-shadow 200ms ease;
}
</style>
