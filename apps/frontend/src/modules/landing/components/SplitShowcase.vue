<script setup lang="ts">
/**
 * Two screenshots as two triangles that make one rectangle, split by a golden diagonal: the
 * character sheet top left, the storyline canvas bottom right. Pointing at one half widens it
 * (the diagonal moves); with a demo each half leads to its screen there. With reduced motion
 * the diagonal stays put.
 */
import { ref } from "vue";

import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

import { demoScreenUrl } from "../demo";
import { SCREEN_HEIGHT, SCREEN_WIDTH, SCREENS } from "../screens";

const { t } = useAppI18n();
const focus = ref<"first" | "second" | null>(null);

const halves = [
  {
    id: "first" as const,
    screen: SCREENS.character,
    label: "landing.hero.splitCharacter" as MessageKey,
    href: demoScreenUrl(SCREENS.character.demoPath),
  },
  {
    id: "second" as const,
    screen: SCREENS.storyline,
    label: "landing.hero.splitStoryline" as MessageKey,
    href: demoScreenUrl(SCREENS.storyline.demoPath),
  },
];
</script>

<template>
  <div
    class="split shadow-soft"
    :class="focus && `split-${focus}`"
    @mouseleave="focus = null"
  >
    <component
      :is="half.href ? 'a' : 'div'"
      v-for="half in halves"
      :key="half.id"
      :href="half.href ?? undefined"
      :target="half.href ? '_blank' : undefined"
      :rel="half.href ? 'noopener' : undefined"
      class="half"
      :class="`half-${half.id}`"
      :aria-label="half.href ? `${t(half.label)} – ${t('landing.screens.open')}` : undefined"
      @mouseenter="focus = half.id"
      @focus="focus = half.id"
      @blur="focus = null"
    >
      <img
        :src="half.screen.src"
        :alt="t(half.screen.alt)"
        :width="SCREEN_WIDTH"
        :height="SCREEN_HEIGHT"
        fetchpriority="high"
        class="shot"
      >
      <span class="label eyebrow">{{ t(half.label) }}</span>
    </component>
  </div>
</template>

<style scoped>
@property --split {
  syntax: "<percentage>";
  inherits: true;
  initial-value: 0%;
}

.split {
  --split: 0%;
  --seam: 3px;
  position: relative;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: var(--color-gold);
  transition: --split 0.5s ease;
}
.split-first {
  --split: 22%;
}
.split-second {
  --split: -22%;
}

.half {
  position: absolute;
  inset: 0;
  display: block;
  overflow: hidden;
  background: var(--color-navy-950);
}
/* The diagonal runs from the top right to the bottom left corner, moved by --split. */
.half-first {
  clip-path: polygon(
    0 0,
    calc(100% + var(--split) - var(--seam)) 0,
    0 calc(100% + var(--split) - var(--seam))
  );
}
.half-second {
  clip-path: polygon(
    calc(100% + var(--split) + var(--seam)) 0,
    100% 0,
    100% 100%,
    0 100%,
    0 calc(100% + var(--split) + var(--seam))
  );
}
.half:focus-visible {
  outline: none;
}
.half:focus-visible .label {
  outline: 2px solid var(--color-gold-light);
  outline-offset: 2px;
}

.shot {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scale(var(--zoom));
  transition: transform 0.5s ease;
}
/*
 * Close-ups of the interesting part, chosen for the triangle each half shows (the app's sidebar
 * left out): name, armor class and hit points of the sheet (top left), both paths of the act
 * board with their scene cards (bottom right).
 */
.half-first .shot {
  --zoom: 1.4;
  transform-origin: 66% 15%;
}
.half-second .shot {
  --zoom: 1.35;
  transform-origin: 72% 78%;
}
.split-first .half-first .shot,
.split-second .half-second .shot {
  transform: scale(calc(var(--zoom) * 0.92));
}

.label {
  position: absolute;
  padding: 6px 12px;
  border: 1px solid var(--color-gold);
  border-radius: 999px;
  background: var(--color-navy-950);
  color: var(--color-gold-light);
}
.half-first .label {
  top: 14px;
  left: 14px;
}
.half-second .label {
  right: 14px;
  bottom: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .split,
  .shot {
    transition: none;
  }
  .split-first,
  .split-second {
    --split: 0%;
  }
}
</style>
