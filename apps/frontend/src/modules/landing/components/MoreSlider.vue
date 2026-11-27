<script setup lang="ts">
/**
 * The further features of the start page as a slider on navy: cards in a golden frame with corner
 * ornaments and a medallion, swiped on touch screens, dragged with the mouse and moved with the
 * arrows or the dots (one card per step). Arrows and dots only show while not every card fits. On every
 * width the next card is cut off at the edge and fades out, so the track reads as a slider.
 *
 * Each card carries a motif that leans on its upper edge. The motifs are as wide as the card
 * and share one geometry (`ART_WIDTH` × `ART_HEIGHT`, the frame's upper edge on row
 * `ART_CONTACT`), so a zone above the card as high as the part above that row keeps the
 * cards aligned and the figures standing on the frame; what lies below it overlaps the card.
 */
import { onBeforeUnmount, onMounted, ref } from "vue";

import Icon from "@/components/base/Icon.vue";
import IconButton from "@/components/base/IconButton.vue";
import type { IconName } from "@/components/base/iconNames";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { useReducedMotion } from "@/core/motion/reducedMotion";

export type MoreItem = { id: string; icon: IconName; title: MessageKey; text: MessageKey; art: string };

/** Size of every motif and the row the card's upper frame edge lies on. */
const ART_WIDTH = 1000;
const ART_HEIGHT = 479;
const ART_CONTACT = 312.5;

const props = defineProps<{ items: MoreItem[]; label: string }>();
const { t } = useAppI18n();
const base = import.meta.env.BASE_URL;

const track = ref<HTMLElement | null>(null);
/** First card in view, and the last card that can still come first. */
const index = ref(0);
const maxIndex = ref(0);
/** Whether the track is scrolled to its start or end; the cut edge on the other sides fades out. */
const atStart = ref(true);
const atEnd = ref(true);

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
    atStart.value = true;
    atEnd.value = true;
    return;
  }
  const range = el.scrollWidth - el.clientWidth;
  // The last step may be shorter than a card, because the next card always peeks in.
  maxIndex.value = Math.max(0, Math.ceil(range / size - 0.05));
  atStart.value = el.scrollLeft <= 2;
  atEnd.value = el.scrollLeft >= range - 2;
  index.value = atEnd.value ? maxIndex.value : Math.min(maxIndex.value, Math.round(el.scrollLeft / size));
}

const reduceMotion = useReducedMotion();

function goTo(target: number) {
  const el = track.value;
  if (!el) return;
  const next = Math.min(Math.max(target, 0), maxIndex.value);
  el.scrollTo({ left: next * step(), behavior: reduceMotion.value ? "auto" : "smooth" });
}

/**
 * Dragging with the mouse (touch scrolls natively). Snapping is off while the track follows the
 * pointer; on release it settles on a card: a short pull returns, a longer one moves at least one
 * card in its direction. A drag swallows the click that ends it.
 */
const DRAG_THRESHOLD = 6;
const FLICK_DISTANCE = 40;
const dragging = ref(false);
let drag: { pointerId: number; startX: number; startLeft: number; moved: boolean } | null = null;
let settleTimer: number | undefined;

function onPointerDown(event: PointerEvent) {
  const el = track.value;
  if (!el || event.pointerType !== "mouse" || event.button !== 0 || maxIndex.value === 0) return;
  window.clearTimeout(settleTimer);
  drag = { pointerId: event.pointerId, startX: event.clientX, startLeft: el.scrollLeft, moved: false };
}

function onPointerMove(event: PointerEvent) {
  const el = track.value;
  if (!el || !drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  if (!drag.moved) {
    if (Math.abs(dx) < DRAG_THRESHOLD) return;
    drag.moved = true;
    dragging.value = true;
    el.setPointerCapture?.(event.pointerId);
  }
  el.scrollLeft = drag.startLeft - dx;
}

function onPointerUp(event: PointerEvent) {
  const el = track.value;
  if (!el || !drag || event.pointerId !== drag.pointerId) return;
  const { moved, startLeft } = drag;
  drag = null;
  if (!moved) return;
  el.releasePointerCapture?.(event.pointerId);
  const size = step();
  const pulled = el.scrollLeft - startLeft;
  const position = size > 0 ? el.scrollLeft / size : 0;
  let target = Math.round(position);
  if (pulled > FLICK_DISTANCE) target = Math.max(target, Math.ceil(startLeft / size + 0.01));
  if (pulled < -FLICK_DISTANCE) target = Math.min(target, Math.floor(startLeft / size - 0.01));
  goTo(target);
  // Snapping comes back once the glide has settled, so it doesn't pull against it.
  settleTimer = window.setTimeout(() => (dragging.value = false), 450);
}

/** The click at the end of a drag would otherwise land on whatever lies under the pointer. */
function onClickCapture(event: MouseEvent) {
  if (!dragging.value) return;
  event.preventDefault();
  event.stopPropagation();
}

let observer: ResizeObserver | undefined;
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && track.value) {
    observer = new ResizeObserver(measure);
    observer.observe(track.value);
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  window.clearTimeout(settleTimer);
});
</script>

<template>
  <div
    role="region"
    aria-roledescription="carousel"
    :aria-label="label"
  >
    <ul
      ref="track"
      class="more-track no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 py-3 sm:mx-0 sm:scroll-px-0 sm:px-0"
      :class="{ 'fade-start': !atStart, 'fade-end': !atEnd, 'can-drag': maxIndex > 0, 'is-dragging': dragging }"
      @scroll.passive="measure"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @click.capture="onClickCapture"
      @dragstart.prevent
    >
      <li
        v-for="(item, position) in props.items"
        :key="item.id"
        class="more-slide flex w-[82%] shrink-0 snap-start flex-col sm:w-[42%] lg:w-[30%]"
        :aria-label="t('landing.more.position', { n: position + 1, total: props.items.length })"
        aria-roledescription="slide"
      >
        <div
          class="relative z-10 pointer-events-none"
          :style="{ aspectRatio: `${ART_WIDTH} / ${ART_CONTACT}` }"
        >
          <img
            :src="item.art"
            alt=""
            aria-hidden="true"
            :width="ART_WIDTH"
            :height="ART_HEIGHT"
            loading="lazy"
            decoding="async"
            class="absolute inset-x-0 top-0 h-auto w-full max-w-none"
          >
        </div>
        <div class="more-card flex-1">
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
            <h3 class="mt-5 font-heading text-[1.1875rem] leading-snug font-bold text-parchment">
              {{ t(item.title) }}
            </h3>
            <img
              :src="`${base}assets/deko/trennlinie-gold.svg`"
              alt=""
              aria-hidden="true"
              class="mt-3 h-4 w-40"
            >
            <p class="mt-3 text-[1rem] text-parchment/80">
              {{ t(item.text) }}
            </p>
          </div>
        </div>
      </li>
    </ul>

    <div
      v-if="maxIndex > 0"
      class="mt-5 flex items-center justify-center gap-3"
    >
      <IconButton
        data-track="landing.more.previous"
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
          data-track="landing.more.position"
          :data-track-detail="String(n)"
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
        data-track="landing.more.next"
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
/* The cut card at an edge with more cards behind it fades out, so the track reads as a slider. */
.more-track {
  --fade-start: 0px;
  --fade-end: 0px;
  mask-image: linear-gradient(
    to right,
    transparent,
    black var(--fade-start),
    black calc(100% - var(--fade-end)),
    transparent
  );
}
.more-track.can-drag {
  cursor: grab;
}
.more-track.is-dragging {
  cursor: grabbing;
  scroll-snap-type: none;
  user-select: none;
}
.more-track.is-dragging .more-slide {
  pointer-events: none;
}
.more-track.fade-start {
  --fade-start: 3rem;
}
.more-track.fade-end {
  --fade-end: 3rem;
}

.more-slide {
  transition: transform 0.3s ease;
}
.more-slide:hover {
  transform: translateY(-4px);
}

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
    border-color 0.3s ease,
    box-shadow 0.3s ease;
}
.more-slide:hover .more-card {
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

:root[data-reduced-motion] .more-slide,
:root[data-reduced-motion] .more-card,
:root[data-reduced-motion] .dot span {
  transition: none;
}
:root[data-reduced-motion] .more-slide:hover {
  transform: none;
}
</style>
