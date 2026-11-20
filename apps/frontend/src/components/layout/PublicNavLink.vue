<script setup lang="ts">
/**
 * Text link of the public pages' navigation (header, phone menu, footer): pointed at or focused,
 * a line in the primary colour grows underneath; the page shown keeps it (`active`, announced as
 * `aria-current="page"`). Buttons never get it. `tone` names the ground: `dark` on navy (a lighter
 * primary, so the line stays visible), `light` on parchment.
 */
import type { RouteLocationRaw } from "vue-router";

withDefaults(defineProps<{ to: RouteLocationRaw; active?: boolean; tone?: "dark" | "light" }>(), {
  active: false,
  tone: "dark",
});
defineSlots<{ default(): unknown }>();
</script>

<template>
  <RouterLink
    :to="to"
    class="public-nav-link inline-flex min-h-11 items-center px-2"
    :class="tone === 'dark' ? 'is-dark' : 'is-light'"
    :aria-current="active ? 'page' : undefined"
  >
    <span class="public-nav-label">
      <slot />
    </span>
  </RouterLink>
</template>

<style scoped>
.public-nav-link {
  outline: none;
}
.is-dark {
  --nav-underline: var(--color-primary-bright);
}
.is-light {
  --nav-underline: var(--color-primary);
}
.public-nav-label {
  position: relative;
  padding-block: 2px;
}
.public-nav-label::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  bottom: -3px;
  height: 2px;
  border-radius: 1px;
  background-color: var(--nav-underline);
  transform: scaleX(0);
  transform-origin: left center;
}
.public-nav-link:hover .public-nav-label::after,
.public-nav-link:focus-visible .public-nav-label::after,
.public-nav-link[aria-current="page"] .public-nav-label::after {
  transform: scaleX(1);
}
.public-nav-link:focus-visible {
  border-radius: var(--radius-card);
  box-shadow: 0 0 0 2px var(--color-gold-light);
}
:root:not([data-reduced-motion]) .public-nav-label::after {
  transition: transform var(--motion-duration-fast) var(--motion-ease-standard);
}
</style>
