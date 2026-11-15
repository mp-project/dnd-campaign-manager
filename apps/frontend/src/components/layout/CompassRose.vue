<script setup lang="ts">
/**
 * The brand's compass rose (deko/kompassrose.svg) drawn inline, so its colors follow the theme:
 * `navy` on the dark shell, `parchment` on parchment, `light`/`active` in the mobile bottom bar.
 */
import { computed } from "vue";

export type CompassTone = "navy" | "parchment" | "light" | "active";

const props = withDefaults(defineProps<{ size?: number; tone?: CompassTone }>(), { size: 48, tone: "navy" });

const TONES: Record<CompassTone, { fill: string; stroke: string }> = {
  navy: { fill: "var(--color-navy-900)", stroke: "var(--color-gold-light)" },
  parchment: { fill: "var(--color-parchment)", stroke: "var(--color-gold)" },
  light: { fill: "var(--color-navy-950)", stroke: "var(--color-parchment)" },
  active: { fill: "var(--color-navy-950)", stroke: "var(--color-gold-light)" },
};
const colors = computed(() => TONES[props.tone]);
const rays = [0, 45, 90, 135];
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 56 56"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <g transform="translate(-21 -7)">
      <circle
        cx="49"
        cy="35"
        r="16.12"
        fill="none"
        :style="{ stroke: colors.stroke }"
        stroke-width="0.9"
      />
      <path
        v-for="ray in rays"
        :key="ray"
        :transform="`rotate(${ray} 49 35)`"
        d="M49 9 L52.64 31.36 L75 35 L52.64 38.64 L49 61 L45.36 38.64 L23 35 L45.36 31.36 Z"
        :style="{ fill: colors.fill, stroke: colors.stroke }"
        stroke-width="0.8"
        stroke-linejoin="round"
      />
      <circle
        cx="49"
        cy="35"
        r="4.16"
        :style="{ fill: colors.stroke }"
      />
    </g>
  </svg>
</template>
