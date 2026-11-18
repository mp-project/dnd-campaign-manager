<script setup lang="ts">
/**
 * Header of the pages outside the app (start page, legal pages, sign-in): brand on the left,
 * actions in the default slot on the right. It stays at the top while the page scrolls and, once
 * the page has left the top, gets slimmer and lets the page shine through slightly.
 * Its content keeps to the column of the public pages (1600 px). `condensed` fixes the state
 * (building blocks page) instead of following the scroll position.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

import BrandMark from "./BrandMark.vue";

withDefaults(defineProps<{ condensed?: boolean }>(), { condensed: undefined });
defineSlots<{ default?(): unknown }>();

/** Scroll distance in px after which the header condenses. */
const THRESHOLD = 16;

const scrolled = ref(false);
function update(): void {
  scrolled.value = window.scrollY > THRESHOLD;
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
        class="ml-auto flex shrink-0 items-center gap-1 sm:gap-2"
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

.is-condensed {
  background-color: color-mix(in srgb, var(--color-navy-950) 85%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-soft);
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

@media (prefers-reduced-motion: no-preference) {
  .site-header,
  .site-header-inner,
  .site-header-brand {
    transition:
      padding 200ms ease,
      transform 200ms ease,
      background-color 200ms ease,
      box-shadow 200ms ease;
  }
}
</style>
