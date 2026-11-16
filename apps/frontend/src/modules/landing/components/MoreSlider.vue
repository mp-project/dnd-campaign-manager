<script setup lang="ts">
/**
 * The further features of the start page as a slider on navy: cards in a golden frame with corner
 * ornaments and a medallion, swiped on touch screens and moved with the arrows or the dots
 * elsewhere (one card per step). Arrows and dots only show while not every card fits.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

import Icon from "@/components/base/Icon.vue";
import IconButton from "@/components/base/IconButton.vue";
import type { IconName } from "@/components/base/iconNames";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

export type MoreItem = { id: string; icon: IconName; title: MessageKey; text: MessageKey };

const props = defineProps<{ items: MoreItem[]; label: string }>();
const { t } = useAppI18n();
const base = import.meta.env.BASE_URL;

const track = ref<HTMLElement | null>(null);
/** First card in view, and the last card that can still come first. */
const index = ref(0);
const maxIndex = ref(0);

function step(): number {
  const el = track.value;
  const first = el?.firstElementChild as HTMLElement | null | undefined;
  if (!el || !first) return 0;
  return first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
}

function measure() {
  const el = track.value;
  const size = step();
  if (!el || size <= 0) {
    index.value = 0;
    maxIndex.value = 0;
    return;
  }
  maxIndex.value = Math.max(0, Math.round((el.scrollWidth - el.clientWidth) / size));
  index.value = Math.min(maxIndex.value, Math.round(el.scrollLeft / size));
}

function goTo(target: number) {
  const el = track.value;
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const next = Math.min(Math.max(target, 0), maxIndex.value);
  el.scrollTo({ left: next * step(), behavior: reduce ? "auto" : "smooth" });
}

let observer: ResizeObserver | undefined;
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && track.value) {
    observer = new ResizeObserver(measure);
    observer.observe(track.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div
    role="region"
    aria-roledescription="carousel"
    :aria-label="label"
  >
    <ul
      ref="track"
      class="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 py-3 sm:mx-0 sm:scroll-px-0 sm:px-0"
      @scroll.passive="measure"
    >
      <li
        v-for="(item, position) in props.items"
        :key="item.id"
        class="more-card w-[82%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] lg:w-[calc((100%-2.5rem)/3)]"
        :aria-label="t('landing.more.position', { n: position + 1, total: props.items.length })"
        aria-roledescription="slide"
      >
        <img
          v-for="corner in ['oben-links', 'oben-rechts', 'unten-links', 'unten-rechts']"
          :key="corner"
          :src="`${base}assets/deko/ecke-${corner}.png`"
          alt=""
          aria-hidden="true"
          class="corner"
          :class="`corner-${corner}`"
        >
        <div class="relative flex h-full flex-col items-center px-6 pt-8 pb-7 text-center">
          <span class="medallion flex size-16 items-center justify-center rounded-full text-gold-light">
            <Icon
              :name="item.icon"
              :size="32"
            />
          </span>
          <h3 class="mt-5 font-heading text-[19px] leading-snug font-bold text-parchment">
            {{ t(item.title) }}
          </h3>
          <img
            :src="`${base}assets/deko/trennlinie-gold.svg`"
            alt=""
            aria-hidden="true"
            class="mt-3 h-4 w-40"
          >
          <p class="mt-3 text-[16px] text-parchment/80">
            {{ t(item.text) }}
          </p>
        </div>
      </li>
    </ul>

    <div
      v-if="maxIndex > 0"
      class="mt-5 flex items-center justify-center gap-3"
    >
      <IconButton
        icon="ui-chevron-left"
        :label="t('landing.more.previous')"
        variant="outline-gold"
        size="md"
        :disabled="index === 0"
        @click="goTo(index - 1)"
      />
      <div class="flex items-center">
        <button
          v-for="n in maxIndex + 1"
          :key="n"
          type="button"
          class="dot"
          :aria-label="t('landing.more.position', { n, total: props.items.length })"
          :aria-current="n - 1 === index ? 'true' : undefined"
          @click="goTo(n - 1)"
        >
          <span />
        </button>
      </div>
      <IconButton
        icon="ui-chevron-right"
        :label="t('landing.more.next')"
        variant="outline-gold"
        size="md"
        :disabled="index >= maxIndex"
        @click="goTo(index + 1)"
      />
    </div>
  </div>
</template>

<style scoped>
.more-card {
  position: relative;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background:
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-gold) 16%, transparent), transparent 65%),
    var(--color-navy-900);
  box-shadow:
    inset 0 0 0 4px var(--color-navy-900),
    inset 0 0 0 5px color-mix(in srgb, var(--color-gold-soft) 45%, transparent);
  transition:
    transform 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}
.more-card:hover {
  transform: translateY(-4px);
  border-color: var(--color-gold-light);
  box-shadow:
    inset 0 0 0 4px var(--color-navy-900),
    inset 0 0 0 5px color-mix(in srgb, var(--color-gold-soft) 70%, transparent),
    0 18px 40px -18px color-mix(in srgb, var(--color-gold) 55%, transparent);
}

.corner {
  position: absolute;
  width: 34px;
  height: 34px;
  opacity: 0.85;
  pointer-events: none;
}
.corner-oben-links {
  top: 7px;
  left: 7px;
}
.corner-oben-rechts {
  top: 7px;
  right: 7px;
}
.corner-unten-links {
  bottom: 7px;
  left: 7px;
}
.corner-unten-rechts {
  right: 7px;
  bottom: 7px;
}

.medallion {
  border: 1px solid var(--color-gold);
  background: radial-gradient(circle at 35% 30%, var(--color-navy-700), var(--color-navy-950) 75%);
  box-shadow:
    0 0 0 4px var(--color-navy-900),
    0 0 0 5px color-mix(in srgb, var(--color-gold) 60%, transparent);
}

.dot {
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
}
.dot span {
  width: 8px;
  height: 8px;
  border: 1px solid var(--color-gold);
  border-radius: 999px;
  transition:
    width 0.3s ease,
    background-color 0.3s ease;
}
.dot[aria-current="true"] span {
  width: 20px;
  background: var(--color-gold-light);
}
.dot:focus-visible {
  outline: 2px solid var(--color-gold-light);
  outline-offset: 1px;
  border-radius: 999px;
}

@media (prefers-reduced-motion: reduce) {
  .more-card,
  .dot span {
    transition: none;
  }
  .more-card:hover {
    transform: none;
  }
}
</style>
