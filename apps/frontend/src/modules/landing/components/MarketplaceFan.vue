<script setup lang="ts">
/**
 * Three screens of the marketplace as a fan of cards: the official content in front, the
 * complete SRD bundle and the community content to its sides. Pointing at a card lifts it, makes
 * it bigger and brings it to the front, with its label. A click (or tap) on the fan, or its button, spreads the
 * cards out below each other at full width, so each can be read, on phones too; another click
 * gathers them again. With reduced motion the cards change place without moving.
 */
import { computed, ref } from "vue";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

import { type Screen, SCREEN_HEIGHT, SCREEN_WIDTH, SCREENS } from "../screens";

const { t } = useAppI18n();
const spread = ref(false);

/** In reading order (spread out); `slot` is the place in the fan. */
const cards: Array<{ id: string; screen: Screen; label: MessageKey; slot: "left" | "center" | "right" }> = [
  { id: "official", screen: SCREENS.marketplace, label: "landing.marketplace.fan.official", slot: "center" },
  { id: "bundle", screen: SCREENS.marketplaceBundle, label: "landing.marketplace.fan.bundle", slot: "left" },
  { id: "community", screen: SCREENS.marketplaceCommunity, label: "landing.marketplace.fan.community", slot: "right" },
];

const hint = computed(() => t(spread.value ? "landing.marketplace.fan.gather" : "landing.marketplace.fan.spread"));

function toggle() {
  spread.value = !spread.value;
}
</script>

<template>
  <div
    class="fan-stage"
    :class="{ spread }"
  >
    <!-- The fan itself takes clicks too; the button below is the way for the keyboard. -->
    <div
      class="fan"
      role="group"
      :aria-label="t('landing.marketplace.fan.label')"
      @click="toggle"
    >
      <div
        v-for="(card, index) in cards"
        :key="card.id"
        class="card"
        :class="`slot-${card.slot}`"
        :style="{ '--index': index }"
      >
        <img
          :src="card.screen.src"
          :alt="t(card.screen.alt)"
          :width="SCREEN_WIDTH"
          :height="SCREEN_HEIGHT"
          loading="lazy"
          class="shot"
        >
        <span class="label eyebrow">{{ t(card.label) }}</span>
      </div>
    </div>
    <div class="hint-row">
      <button
        type="button"
        class="hint"
        :aria-expanded="spread"
        @click="toggle"
      >
        <Icon
          :name="spread ? 'aktion-einklappen' : 'aktion-ausklappen'"
          :size="16"
        />
        {{ hint }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/*
 * Every card is laid out at the full width of the stage (16:10) and placed by transform alone,
 * around its bottom middle: scaled down, shifted and turned in the fan, at full size below each
 * other when spread out. The stage's height follows (container units, so it scales with it).
 */
.fan-stage {
  --gap: 20px;
  container-type: inline-size;
}
.fan {
  position: relative;
  height: 48cqw;
  cursor: pointer;
  transition: height 0.6s ease;
}
.spread .fan {
  height: calc(3 * 62.5cqw + 2 * var(--gap));
}

.card {
  --x: 0cqw;
  --y: 0cqw;
  --turn: 0deg;
  --scale: 0.62;
  --lift: 0cqw;
  --grow: 0;
  position: absolute;
  top: 0;
  left: 0;
  width: 100cqw;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: var(--color-navy-950);
  box-shadow: 0 18px 40px -12px color-mix(in srgb, var(--color-navy-950) 85%, transparent);
  transform: translate(var(--x), calc(var(--y) - var(--lift))) rotate(var(--turn)) scale(calc(var(--scale) + var(--grow)));
  transform-origin: 50% 100%;
  transition:
    transform 0.5s cubic-bezier(0.3, 0.7, 0.4, 1),
    box-shadow 0.5s ease;
}
/* The fan: the official content in front, a little higher, the others turned to its sides. */
.slot-center {
  --y: -21cqw;
  z-index: 3;
}
.slot-left {
  --x: -17cqw;
  --y: -19cqw;
  --turn: -9deg;
  z-index: 2;
}
.slot-right {
  --x: 17cqw;
  --y: -19cqw;
  --turn: 9deg;
  z-index: 1;
}
/* Pointing at a card lifts it, makes it bigger and brings it to the front. */
@media (hover: hover) {
  .fan-stage:not(.spread) .card:hover {
    --lift: 5cqw;
    --grow: 0.08;
    z-index: 4;
    box-shadow: 0 28px 60px -14px color-mix(in srgb, var(--color-navy-950) 95%, transparent);
  }
}

/* Spread out: full size, upright, below each other in reading order. */
.spread .card {
  --x: 0cqw;
  --y: calc(var(--index) * (62.5cqw + var(--gap)));
  --turn: 0deg;
  --scale: 1;
  transition-delay: calc(var(--index) * 60ms);
}

.shot {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.label {
  position: absolute;
  bottom: 2.4cqw;
  left: 2.4cqw;
  padding: 0.35em 0.8em;
  border: 1px solid var(--color-gold);
  border-radius: 999px;
  background: var(--color-navy-950);
  color: var(--color-gold-light);
  font-size: clamp(12px, 2.4cqw, 18px);
}
/*
 * In the fan the cards are scaled down, so the label is set larger to stay readable. Only the
 * card in front shows it; the others, mostly covered, show theirs once pointed at (or spread out).
 */
.fan-stage:not(.spread) .label {
  bottom: 3.6cqw;
  left: 3.6cqw;
  font-size: clamp(17px, 3cqw, 22px);
}
.label {
  transition: opacity 0.3s ease;
}
.fan-stage:not(.spread) .card:not(.slot-center):not(:hover) .label {
  opacity: 0;
}

.hint-row {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}
.hint {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 1px solid var(--color-gold);
  border-radius: 999px;
  color: var(--color-gold-light);
  font-size: 15px;
  transition: background-color 0.2s ease;
}
.hint:hover {
  background: var(--color-navy-900);
}
.hint:focus-visible {
  outline: 2px solid var(--color-gold-light);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .fan,
  .card {
    transition: none;
  }
}
</style>
