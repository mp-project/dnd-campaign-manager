<script setup lang="ts">
/**
 * Icon from the shared sprite (public/assets/icons/chronik.svg), colored through currentColor
 * (text-ink, text-gold-light …). Sizes 16/20/24/32, domain icons in page headers 40–48.
 * Without `label` it is decorative (hidden from screen readers). An unknown name renders nothing.
 */
import { computed } from "vue";

import type { IconName } from "./iconNames";

const props = withDefaults(defineProps<{ name: IconName; size?: number | string; label?: string }>(), {
  size: 20,
  label: "",
});

const href = computed(() => `${import.meta.env.BASE_URL}assets/icons/chronik.svg#${props.name}`);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    class="shrink-0"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
    focusable="false"
  ><use :href="href" /></svg>
</template>
