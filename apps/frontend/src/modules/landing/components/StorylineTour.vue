<script setup lang="ts">
/**
 * The storyline feature as a camera ride over the clickdummy's act board, on navy: a capture of
 * the board at 2.5 times its size (so it stays sharp when the camera moves in) fills a large stage, the camera moves from scene to scene along one route, and a golden thread weaves
 * itself between the scenes it passed. Visitors switch between the two routes of the board, jump to
 * a scene, pause the ride or show the whole board. The ride starts once the stage is in view and
 * pauses while pointed at or focused; with reduced motion it doesn't play by itself and jumps
 * instead of moving. The frame of the stage leads nowhere; the demo link sits below it.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import IconButton from "@/components/base/IconButton.vue";
import SegmentedControl from "@/components/base/SegmentedControl.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";

import board from "../assets/screens/storyline-board.webp";
import { demoScreenUrl } from "../demo";
import { SCREENS } from "../screens";

type RouteId = "official" | "secret";
/** A scene card of the board, in CSS pixels of the captured board (the file has 2.5 times as many). */
type Stop = { id: string; x: number; y: number; width: number; height: number; title: MessageKey; text: MessageKey };
/** `threads[i]` leads from stop i to stop i + 1, as an SVG path in CSS pixels of the board. */
type Route = { id: RouteId; label: MessageKey; stops: Stop[]; threads: string[] };

const { t } = useAppI18n();
const screen = SCREENS.storyline;
const demo = demoScreenUrl(screen.demoPath);
/** The captured board: Akt I and II of the clickdummy's storyline canvas. */
const BOARD_WIDTH = 2106;
const BOARD_HEIGHT = 860;
const RATIO = BOARD_HEIGHT / BOARD_WIDTH;
const STEP_MS = 2800;

const start: Stop = {
  id: "start",
  x: 52,
  y: 361,
  width: 258,
  height: 138,
  title: "landing.storylineTour.stops.start.title",
  text: "landing.storylineTour.stops.start.text",
};

const routes: Record<RouteId, Route> = {
  official: {
    id: "official",
    label: "landing.storylineTour.routes.official",
    stops: [
      start,
      { id: "bribe", x: 396, y: 86, width: 361, height: 234, title: "landing.storylineTour.stops.bribe.title", text: "landing.storylineTour.stops.bribe.text" },
      { id: "gate", x: 1136, y: 215, width: 378, height: 237, title: "landing.storylineTour.stops.gate.title", text: "landing.storylineTour.stops.gate.text" },
      { id: "watch", x: 1704, y: 215, width: 378, height: 237, title: "landing.storylineTour.stops.watch.title", text: "landing.storylineTour.stops.watch.text" },
    ],
    threads: ["M310 430 C352 430 352 203 396 203", "M757 196 C850 196 940 324 1049 324 L1136 324", "M1514 324 L1704 324"],
  },
  secret: {
    id: "secret",
    label: "landing.storylineTour.routes.secret",
    stops: [
      start,
      { id: "tunnel", x: 396, y: 602, width: 361, height: 234, title: "landing.storylineTour.stops.tunnel.title", text: "landing.storylineTour.stops.tunnel.text" },
      { id: "below", x: 1136, y: 602, width: 378, height: 237, title: "landing.storylineTour.stops.below.title", text: "landing.storylineTour.stops.below.text" },
      { id: "vault", x: 1704, y: 602, width: 378, height: 237, title: "landing.storylineTour.stops.vault.title", text: "landing.storylineTour.stops.vault.text" },
    ],
    threads: ["M310 430 C352 430 352 719 396 719", "M757 712 L1136 712", "M1514 712 L1704 712"],
  },
};

const routeId = ref<RouteId>("official");
const index = ref(0);
/** The whole board instead of one scene: at first, and when asked for. */
const overview = ref(true);
const playing = ref(false);
const paused = ref(false);
const reduceMotion = ref(false);

const route = computed(() => routes[routeId.value]);
const stop = computed(() => route.value.stops[index.value] ?? start);
const routeOptions = computed(() =>
  (Object.values(routes) as Route[]).map((entry) => ({ value: entry.id, label: t(entry.label) })),
);

// ---- Camera ---------------------------------------------------------------------------------

const frame = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });

/**
 * The stage is the board at the frame's width, moved and scaled from its top left corner. A scene
 * shows about 1050 pixels of the board on wide frames and 580 on phones (about three and one and
 * a half scene cards), so its text stays readable; the camera never leaves the board.
 */
const camera = computed(() => {
  const { width, height } = size.value;
  if (!width || !height) return { x: 0, y: 0, zoom: 1 };
  const stageHeight = width * RATIO;
  if (overview.value) return { x: 0, y: Math.max(0, (height - stageHeight) / 2), zoom: 1 };
  const visible = Math.min(1050, Math.max(580, width * 0.94));
  const zoom = Math.max(BOARD_WIDTH / visible, height / stageHeight);
  const scale = (width / BOARD_WIDTH) * zoom;
  const focusX = (stop.value.x + stop.value.width / 2) * scale;
  const focusY = (stop.value.y + stop.value.height / 2) * scale;
  const clamp = (value: number, min: number) => Math.min(0, Math.max(min, value));
  // On phones the caption covers the lower part of the stage, so the scene sits higher.
  const centerY = width < 768 ? height * 0.34 : height / 2;
  return {
    x: clamp(width / 2 - focusX, width - width * zoom),
    y: clamp(centerY - focusY, height - stageHeight * zoom),
    zoom,
  };
});

const stageStyle = computed(() => ({
  width: `${size.value.width}px`,
  height: `${size.value.width * RATIO}px`,
  transform: `translate(${camera.value.x}px, ${camera.value.y}px) scale(${camera.value.zoom})`,
}));

// ---- Ride -----------------------------------------------------------------------------------

let timer: ReturnType<typeof setInterval> | undefined;

/** One step of the ride: next scene, at the end of a route the other route from its start. */
function advance() {
  if (paused.value) return;
  if (overview.value) {
    overview.value = false;
    return;
  }
  if (index.value < route.value.stops.length - 1) {
    index.value += 1;
    return;
  }
  routeId.value = routeId.value === "official" ? "secret" : "official";
  index.value = 0;
}

function play() {
  stopTimer();
  playing.value = true;
  timer = setInterval(advance, STEP_MS);
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

function pause() {
  stopTimer();
  playing.value = false;
}

function togglePlay() {
  if (playing.value) {
    pause();
    return;
  }
  if (overview.value) overview.value = false;
  play();
}

/** What the visitor chooses stops the ride: they look around themselves now. */
function goTo(target: number) {
  pause();
  overview.value = false;
  index.value = target;
}

function chooseRoute(id: RouteId) {
  pause();
  overview.value = false;
  routeId.value = id;
  index.value = 0;
}

function toggleOverview() {
  pause();
  overview.value = !overview.value;
}

const selectedRoute = computed({
  get: () => routeId.value,
  set: (id: RouteId) => chooseRoute(id),
});

let resize: ResizeObserver | undefined;
let visibility: IntersectionObserver | undefined;
let started = false;

function measure() {
  const el = frame.value;
  if (el) size.value = { width: el.clientWidth, height: el.clientHeight };
}

onMounted(() => {
  reduceMotion.value = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  measure();
  if (typeof ResizeObserver !== "undefined" && frame.value) {
    resize = new ResizeObserver(measure);
    resize.observe(frame.value);
  }
  if (reduceMotion.value || typeof IntersectionObserver === "undefined" || !frame.value) return;
  // The ride starts the first time the stage is well in view and rests while it is out of view.
  visibility = new IntersectionObserver(
    ([entry]) => {
      if (!entry) return;
      if (entry.isIntersecting && !started) {
        started = true;
        overview.value = false;
        play();
      } else if (!entry.isIntersecting && playing.value) {
        paused.value = true;
      } else if (entry.isIntersecting) {
        paused.value = false;
      }
    },
    { threshold: 0.45 },
  );
  visibility.observe(frame.value);
});

onBeforeUnmount(() => {
  stopTimer();
  resize?.disconnect();
  visibility?.disconnect();
});
</script>

<template>
  <div
    class="tour"
    :class="{ 'tour-still': reduceMotion }"
  >
    <div
      ref="frame"
      class="tour-frame shadow-soft"
      @mouseenter="paused = true"
      @mouseleave="paused = false"
      @focusin="paused = true"
      @focusout="paused = false"
    >
      <div
        class="tour-stage"
        :style="stageStyle"
      >
        <img
          :src="board"
          :alt="t(screen.alt)"
          :width="BOARD_WIDTH"
          :height="BOARD_HEIGHT"
          loading="lazy"
          decoding="async"
          class="block size-full"
        >
        <svg
          class="tour-threads"
          :viewBox="`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`"
          aria-hidden="true"
        >
          <path
            v-for="(thread, position) in route.threads"
            :key="`${route.id}-${position}`"
            :d="thread"
            pathLength="1"
            class="thread"
            :class="{ 'thread-drawn': !overview && index > position }"
          />
          <rect
            v-for="(entry, position) in route.stops"
            :key="`${route.id}-${entry.id}`"
            :x="entry.x - 6"
            :y="entry.y - 6"
            :width="entry.width + 12"
            :height="entry.height + 12"
            rx="10"
            pathLength="1"
            class="scene-mark"
            :class="{ 'scene-current': !overview && position === index, 'scene-passed': !overview && position < index }"
          />
        </svg>
      </div>
      <div
        class="tour-vignette"
        aria-hidden="true"
      />

      <Transition
        name="caption"
        mode="out-in"
      >
        <div
          v-if="!overview"
          :key="`${route.id}-${stop.id}`"
          class="tour-caption"
        >
          <p class="eyebrow text-gold-light">
            {{ t("landing.storylineTour.position", { n: index + 1, total: route.stops.length }) }} · {{ t(route.label) }}
          </p>
          <p class="mt-1 font-heading text-[17px] leading-snug font-bold text-parchment md:text-[19px]">
            {{ t(stop.title) }}
          </p>
          <p class="mt-1 text-[14px] text-parchment/85 md:text-[15px]">
            {{ t(stop.text) }}
          </p>
        </div>
        <div
          v-else
          class="tour-caption tour-caption-hint"
        >
          <Icon
            name="nav-storylines"
            :size="20"
            class="shrink-0 text-gold-light"
          />
          <p class="text-[14px] text-parchment/90 md:text-[15px]">
            {{ t("landing.storylineTour.overviewHint") }}
          </p>
        </div>
      </Transition>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
      <SegmentedControl
        v-model="selectedRoute"
        :options="routeOptions"
        :label="t('landing.storylineTour.routesLabel')"
        class="w-full shrink-0 sm:w-auto"
      />
      <ol
        class="order-last flex w-full min-w-0 flex-wrap items-center gap-x-1 gap-y-2"
        :aria-label="t('landing.storylineTour.stopsLabel')"
      >
        <li
          v-for="(entry, position) in route.stops"
          :key="`${route.id}-${entry.id}`"
          class="flex items-center gap-1"
        >
          <span
            v-if="position > 0"
            class="step-line"
            :class="{ 'step-line-done': !overview && index >= position }"
            aria-hidden="true"
          />
          <button
            type="button"
            class="step"
            :class="{ 'step-current': !overview && index === position, 'step-done': !overview && index > position }"
            :aria-current="!overview && index === position ? 'step' : undefined"
            @click="goTo(position)"
          >
            <span class="step-number">{{ position + 1 }}</span>
            <span class="step-label">{{ t(entry.title) }}</span>
          </button>
        </li>
      </ol>
      <div class="ml-auto flex shrink-0 items-center gap-2">
        <IconButton
          :icon="playing ? 'ui-pause' : 'ui-play'"
          :label="t(playing ? 'landing.storylineTour.pause' : 'landing.storylineTour.play')"
          variant="outline-gold"
          size="md"
          @click="togglePlay"
        />
        <IconButton
          :icon="overview ? 'aktion-zoom-plus' : 'aktion-zoom-minus'"
          :label="t(overview ? 'landing.storylineTour.closer' : 'landing.storylineTour.overview')"
          variant="outline-gold"
          size="md"
          @click="toggleOverview"
        />
        <BaseButton
          v-if="demo"
          as="a"
          :href="demo"
          target="_blank"
          rel="noopener"
          variant="outline-gold"
          size="md"
          icon="aktion-ansehen"
          class="ml-2"
        >
          {{ t("landing.screens.open") }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tour-frame {
  position: relative;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: var(--color-navy-900);
  box-shadow: 0 30px 70px -30px color-mix(in srgb, var(--color-gold) 35%, transparent);
}
@media (min-width: 48rem) {
  .tour-frame {
    aspect-ratio: 16 / 9;
  }
}
@media (min-width: 64rem) {
  .tour-frame {
    aspect-ratio: 16 / 8;
  }
}
/* The golden inner line of the work surface's double frame, above the moving picture. */
.tour-frame::after {
  content: "";
  position: absolute;
  inset: 4px;
  border: 1px solid var(--color-gold-soft);
  border-radius: calc(var(--radius-card) - 3px);
  pointer-events: none;
}

.tour-stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  /* No will-change: the browser paints the picture again at the final scale, so it ends up sharp. */
  transition: transform 1.1s cubic-bezier(0.65, 0, 0.35, 1);
}

.tour-threads {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.thread {
  fill: none;
  stroke: var(--color-gold-light);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  filter: drop-shadow(0 0 6px var(--color-gold));
  transition: stroke-dashoffset 0.8s ease 0.35s;
}
.thread-drawn {
  stroke-dashoffset: 0;
}
.scene-mark {
  fill: none;
  stroke: var(--color-gold);
  stroke-width: 4;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  opacity: 0;
  transition:
    stroke-dashoffset 0.6s ease 0.7s,
    opacity 0.3s ease;
}
.scene-passed {
  opacity: 0.55;
  stroke-dashoffset: 0;
}
.scene-current {
  opacity: 1;
  stroke-dashoffset: 0;
  filter: drop-shadow(0 0 10px var(--color-gold-light));
  animation: scene-glow 2.4s ease-in-out 1.3s infinite;
}
@keyframes scene-glow {
  50% {
    stroke: var(--color-gold-light);
  }
}

.tour-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 45%, transparent 55%, color-mix(in srgb, var(--color-navy-950) 28%, transparent));
}

.tour-caption {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  max-width: 30rem;
  padding: 12px 16px;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-navy-950) 92%, transparent);
  box-shadow: var(--shadow-popover);
}
@media (min-width: 48rem) {
  .tour-caption {
    right: auto;
    bottom: 20px;
    left: 20px;
  }
}
.tour-caption-hint {
  display: flex;
  align-items: center;
  gap: 10px;
}
.caption-enter-active,
.caption-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.caption-enter-active {
  transition-delay: 0.55s;
}
.caption-enter-from,
.caption-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.step {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-control);
  color: color-mix(in srgb, var(--color-parchment) 75%, transparent);
  text-align: left;
}
.step:hover {
  background: var(--color-navy-800);
}
.step-number {
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-gold);
  border-radius: 999px;
  background: var(--color-navy-900);
  font-family: var(--font-heading);
  font-size: 13px;
  transition:
    background-color 0.4s ease,
    color 0.4s ease;
}
.step-label {
  font-size: 15px;
  line-height: 1.2;
}
.step-done .step-number {
  background: var(--color-gold-soft);
  color: var(--color-ink);
}
.step-current {
  color: var(--color-parchment);
}
.step-current .step-number {
  border-color: var(--color-gold-light);
  background: var(--color-primary);
  color: var(--color-parchment-card);
}
.step-current .step-label {
  font-weight: 600;
}
.step-line {
  width: 16px;
  height: 2px;
  background: var(--color-navy-line);
  transition: background-color 0.6s ease;
}
.step-line-done {
  background: var(--color-gold-light);
}
/* On phones the scenes keep their number; the caption names the current one. */
@media (max-width: 47.99rem) {
  .step .step-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

.tour-still .tour-stage,
.tour-still .thread,
.tour-still .scene-mark,
.tour-still .caption-enter-active,
.tour-still .caption-leave-active {
  transition: none;
}
.tour-still .scene-current {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  .tour-stage,
  .thread,
  .scene-mark,
  .caption-enter-active,
  .caption-leave-active {
    transition: none;
  }
  .scene-current {
    animation: none;
  }
}
</style>
