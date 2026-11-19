<script setup lang="ts">
/**
 * One feature of the start page: icon, title, text and check points beside or above its picture
 * (default slot). Features with a `band` run as a navy or parchment band across the page; a navy
 * band carries a drawn landscape on its upper edge. A `scene` (a watercolour) stands faintly at
 * the outer edge on the side of the text, fading towards the middle; the `decor` slot takes
 * props placed absolutely in the row. On first sight the row rises into view and its text follows
 * from its own side.
 */
import { computed } from "vue";

import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { type RevealFrom, vReveal } from "@/core/motion/reveal";

import LandscapeEdge from "./LandscapeEdge.vue";

export type FeatureRowData = {
  id: string;
  icon: IconName;
  title: MessageKey;
  text: MessageKey;
  points: MessageKey[];
  /** Where the picture goes from md on: beside the text, or across the full width below it. */
  layout: "left" | "right" | "wide";
  /**
   * A band across the page instead of the light backdrop: `navy` like the footer, `parchment`
   * with the paper texture, to set a feature apart from its light neighbours.
   */
  band?: "navy" | "parchment";
  /** A watercolour at the outer edge of the given side, behind the text. */
  scene?: { src: string; side: "left" | "right" };
};

const props = defineProps<{ feature: FeatureRowData }>();
const dark = computed(() => props.feature.band === "navy");

const BAND = {
  navy: "navy-shade relative z-10 mt-24 mb-7 overflow-x-clip bg-navy-950 py-14 text-parchment md:mt-36 md:mb-10 md:py-20",
  parchment: "parchment on-parchment relative my-7 overflow-x-clip border-y border-gold/60 py-14 md:my-10 md:py-20",
} as const;
defineSlots<{ default(): unknown; decor?(): unknown }>();
const { t } = useAppI18n();

/** Grid of a feature row, order of its text and the side the text moves in from, per layout. */
const LAYOUT = {
  left: { row: "md:grid-cols-[3fr_2fr]", text: "md:order-last", textFrom: "right" },
  right: { row: "md:grid-cols-[2fr_3fr]", text: "", textFrom: "left" },
  wide: { row: "", text: "md:grid md:grid-cols-2 md:gap-x-12", textFrom: "below" },
} as const satisfies Record<FeatureRowData["layout"], { row: string; text: string; textFrom: RevealFrom }>;
</script>

<template>
  <div
    :class="feature.band ? BAND[feature.band] : 'relative overflow-x-clip py-7 md:py-10'"
  >
    <LandscapeEdge v-if="dark" />
    <div
      v-if="dark"
      class="feature-dark-glow pointer-events-none absolute inset-0"
    />
    <img
      v-if="feature.scene"
      :src="feature.scene.src"
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      class="feature-scene"
      :class="`scene-${feature.scene.side}`"
    >
    <article
      v-reveal
      class="relative mx-auto grid max-w-400 items-center gap-6 px-4 md:gap-12 md:px-10"
      :class="[LAYOUT[feature.layout].row, feature.layout === 'wide' && 'md:gap-8']"
      :aria-labelledby="`landing-feature-${feature.id}`"
    >
      <div
        v-reveal="{ from: LAYOUT[feature.layout].textFrom, delay: 180 }"
        :class="LAYOUT[feature.layout].text"
      >
        <div>
          <div class="flex items-center gap-4">
            <span
              class="flex size-14 shrink-0 items-center justify-center rounded-full text-gold-light"
              :class="dark ? 'border border-gold bg-navy-900' : 'bg-navy-950'"
            >
              <Icon
                :name="feature.icon"
                :size="32"
              />
            </span>
            <h3
              :id="`landing-feature-${feature.id}`"
              class="section-title text-[24px]"
              :class="dark && 'text-parchment'"
            >
              {{ t(feature.title) }}
            </h3>
          </div>
          <p
            class="mt-4 text-[17px]"
            :class="dark ? 'text-parchment/85' : 'text-ink-2'"
          >
            {{ t(feature.text) }}
          </p>
        </div>
        <ul
          class="mt-4 flex flex-col gap-2"
          :class="feature.layout === 'wide' && 'md:mt-0 md:self-end'"
        >
          <li
            v-for="point in feature.points"
            :key="point"
            class="flex items-start gap-2"
          >
            <Icon
              name="ui-check"
              :size="20"
              class="mt-0.5 shrink-0"
              :class="dark ? 'text-gold-light' : 'text-ok'"
            />
            <span>{{ t(point) }}</span>
          </li>
        </ul>
      </div>
      <slot />
      <slot name="decor" />
    </article>
  </div>
</template>

<style scoped>
.feature-scene {
  position: absolute;
  top: 0;
  width: auto;
  max-width: 70%;
  height: 320px;
  object-fit: contain;
  pointer-events: none;
  opacity: 0.32;
}
.scene-left {
  left: -2rem;
  object-position: left;
  mask-image: linear-gradient(to right, black 30%, transparent 90%);
}
.scene-right {
  right: -2rem;
  object-position: right;
  mask-image: linear-gradient(to left, black 30%, transparent 90%);
}
@media (min-width: 768px) {
  .feature-scene {
    top: 50%;
    max-width: 40%;
    height: min(115%, 620px);
    opacity: 0.36;
    transform: translateY(-50%);
  }
  .scene-left {
    left: 0;
  }
  .scene-right {
    right: 0;
  }
}

.navy-shade {
  box-shadow: 0 22px 36px -18px color-mix(in srgb, var(--color-navy-950) 55%, transparent);
}

.feature-dark-glow {
  background: radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--color-gold) 14%, transparent), transparent 60%);
}
</style>
