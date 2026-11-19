<script setup lang="ts">
/**
 * The storyline feature as a camera ride over the clickdummy's act board, on navy: a capture of
 * the board at 2.5 times its size (so it stays sharp when the camera moves in) fills a large stage, the camera moves from scene to scene along one route, and a golden thread weaves
 * itself between the scenes it passed. Visitors switch between the two routes of the board, jump to
 * a scene, pause the ride or show the whole board. Along a route the camera pans from scene to
 * scene; to the other route it pulls back on the way to its start and moves in again. Then the
 * thread and the scene's frame draw themselves (GSAP). The ride starts
 * once the stage is in view and rests while it is out of view; with reduced motion it doesn't
 * play by itself and jumps instead of moving. The frame of the stage leads nowhere; the demo link
 * sits below it.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import IconButton from "@/components/base/IconButton.vue";
import SegmentedControl from "@/components/base/SegmentedControl.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { gsap, motionEase, ScrollTrigger } from "@/core/motion/gsap";
import { useReducedMotion } from "@/core/motion/reducedMotion";
import { useGsap } from "@/core/motion/useGsap";

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
/** How long the ride rests on a scene once the camera arrived and its frame is drawn. */
const REST_MS = 800;

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
const reduceMotion = useReducedMotion();

const route = computed(() => routes[routeId.value]);
const stop = computed(() => route.value.stops[index.value] ?? start);
const routeOptions = computed(() =>
  (Object.values(routes) as Route[]).map((entry) => ({ value: entry.id, label: t(entry.label) })),
);

// ---- Camera ---------------------------------------------------------------------------------

const frame = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });

type Camera = { x: number; y: number; zoom: number };
type Point = { x: number; y: number };

const centerOf = (entry: Stop): Point => ({ x: entry.x + entry.width / 2, y: entry.y + entry.height / 2 });

/**
 * The stage is the board at the frame's width, moved and scaled from its top left corner. A scene
 * shows about 1050 pixels of the board on wide frames and 580 on phones (about three and one and
 * a half scene cards), so its text stays readable; `pullBack` below 1 shows more of the board
 * around `focus` (the camera's arc between two scenes). The camera never leaves the board; without
 * a focus it shows the whole board.
 */
function cameraAt(focus: Point | null, pullBack = 1): Camera {
  const { width, height } = size.value;
  if (!width || !height) return { x: 0, y: 0, zoom: 1 };
  const stageHeight = width * RATIO;
  if (!focus) return { x: 0, y: Math.max(0, (height - stageHeight) / 2), zoom: 1 };
  const fill = height / stageHeight;
  const visible = Math.min(1050, Math.max(580, width * 0.94));
  const zoom = Math.max(fill, Math.max(BOARD_WIDTH / visible, fill) * pullBack);
  const scale = (width / BOARD_WIDTH) * zoom;
  const clamp = (value: number, min: number) => Math.min(0, Math.max(min, value));
  // On phones the caption covers the lower part of the stage, so the scene sits higher.
  const centerY = width < 768 ? height * 0.34 : height / 2;
  return {
    x: clamp(width / 2 - focus.x * scale, width - width * zoom),
    y: clamp(centerY - focus.y * scale, height - stageHeight * zoom),
    zoom,
  };
}

const stageStyle = computed(() => ({ width: `${size.value.width}px`, height: `${size.value.width * RATIO}px` }));

// ---- Motion ---------------------------------------------------------------------------------

/**
 * How long the camera travels. Along a route it pans from scene to scene; to the other route it
 * pulls back on the way to its start and moves in again.
 */
const MOVE = { pan: 1, out: 0.6, in: 0.8 };
/** How far the camera pulls back when it changes routes. */
const PULL_BACK = 0.62;

/** The step animation running now: camera, then thread and scene frame. */
let ride: gsap.core.Timeline | undefined;
/** The scene and route the camera shows now: a new route makes the camera pull back on its way. */
let shown: Stop | null = null;
let shownRoute: RouteId = routeId.value;

const transform = (camera: Camera) => ({ x: camera.x, y: camera.y, scale: camera.zoom });

/**
 * Threads up to the current scene are drawn, the scene's frame is drawn and glows, passed scenes
 * keep a faint frame. Changes move in `timeline` from `at` on, or jump without one.
 */
function paintRoute(timeline?: gsap.core.Timeline, at = 0): void {
  const root = stage.value;
  if (!root) return;
  const apply = (el: Element, vars: gsap.TweenVars, duration: number, offset = 0) => {
    if (timeline) timeline.to(el, { ...vars, duration, ease: motionEase("out") }, at + offset);
    else gsap.set(el, vars);
  };
  root.querySelectorAll(".thread").forEach((el, position) => {
    const drawn = !overview.value && index.value > position;
    // Threads that disappear do so at once, so a step back doesn't unwind slowly.
    if (drawn) apply(el, { strokeDashoffset: 0 }, 0.9);
    else gsap.set(el, { strokeDashoffset: 1 });
  });
  root.querySelectorAll(".scene-mark").forEach((el, position) => {
    const current = !overview.value && position === index.value;
    const passed = !overview.value && position < index.value;
    if (current) {
      apply(el, { opacity: 1 }, 0.3, 0.35);
      apply(el, { strokeDashoffset: 0 }, 0.7, 0.35);
    } else if (passed) apply(el, { opacity: 0.55, strokeDashoffset: 0 }, 0.4);
    else apply(el, { opacity: 0, strokeDashoffset: 1 }, 0.3);
  });
}

/** Moves the camera to the current view: at once (resize, reduced motion), or as a ride. */
function showView(immediate: boolean): void {
  const el = stage.value;
  if (!el) return;
  ride?.kill();
  ride = undefined;
  const target = overview.value ? null : stop.value;
  const camera = cameraAt(target && centerOf(target));
  const from = shown;
  const routeChanged = shownRoute !== routeId.value;
  shown = target;
  shownRoute = routeId.value;

  if (immediate || reduceMotion.value) {
    gsap.set(el, transform(camera));
    paintRoute();
    return;
  }

  ride = gsap.timeline();
  if (from && target && routeChanged) {
    const a = centerOf(from);
    const b = centerOf(target);
    const middle = cameraAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, PULL_BACK);
    ride
      .to(el, { ...transform(middle), duration: MOVE.out, ease: motionEase("in-out") })
      .to(el, { ...transform(camera), duration: MOVE.in, ease: motionEase("out") });
  } else {
    ride.to(el, { ...transform(camera), duration: MOVE.pan, ease: motionEase("in-out") });
  }
  paintRoute(ride, ride.duration() - 0.35);
  // The ride goes on once this step is done and the scene had a moment.
  if (playing.value) schedule(ride.duration() * 1000 + REST_MS);
}

watch([routeId, index, overview], () => showView(false), { flush: "post" });
watch(size, () => showView(true), { flush: "post" });

// ---- Ride -----------------------------------------------------------------------------------

/**
 * Out of view the ride rests. Pointing at the stage doesn't: after scrolling the pointer often
 * stays on it by chance, and the ride would stand still; the pause button stops it on purpose.
 */
const outOfView = ref(false);
let next: gsap.core.Tween | undefined;

/** One step of the ride: next scene, at the end of a route the other route from its start. */
function advance() {
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

/** The next step after `delay`; the step itself schedules the one after it (`showView`). */
function schedule(delay: number) {
  next?.kill();
  next = gsap.delayedCall(delay / 1000, advance);
  if (outOfView.value) next.pause();
}

watch(outOfView, (isOut) => {
  if (!next) return;
  if (isOut) next.pause();
  else next.resume();
});

/** From the overview the ride starts with the first scene; otherwise it rests there first. */
function play() {
  playing.value = true;
  if (overview.value) overview.value = false;
  else schedule(REST_MS);
}

function pause() {
  next?.kill();
  next = undefined;
  playing.value = false;
}

function togglePlay() {
  if (playing.value) pause();
  else play();
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
let started = false;

function measure() {
  const el = frame.value;
  if (el) size.value = { width: el.clientWidth, height: el.clientHeight };
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined" && frame.value) {
    resize = new ResizeObserver(measure);
    resize.observe(frame.value);
  }
});

/**
 * The ride starts the first time the stage is well in view and rests while it is out of view;
 * with reduced motion it doesn't play by itself.
 */
useGsap(frame, ({ reduced }) => {
  showView(true);
  if (!reduced && frame.value) {
    ScrollTrigger.create({
      trigger: frame.value,
      start: "top 75%",
      end: "bottom 25%",
      onToggle: (self) => {
        outOfView.value = !self.isActive;
        if (self.isActive && !started) {
          started = true;
          play();
        }
      },
    });
  } else if (reduced) pause();
  return () => {
    ride?.kill();
    pause();
  };
});

onBeforeUnmount(() => resize?.disconnect());
</script>

<template>
  <div class="tour">
    <div
      ref="frame"
      class="tour-frame shadow-soft"
    >
      <div
        ref="stage"
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
            :class="{ 'scene-current': !overview && position === index }"
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
  /* Moved and scaled by GSAP. No will-change: the browser paints the picture again at the final scale, so it ends up sharp. */
  transform-origin: 0 0;
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
}
.scene-mark {
  fill: none;
  stroke: var(--color-gold);
  stroke-width: 4;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  opacity: 0;
}
/* Threads and scene frames are drawn by GSAP (`stroke-dashoffset`, `opacity`); the glow stays CSS. */
.scene-current {
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
    opacity var(--motion-duration-slow) var(--motion-ease-out),
    transform var(--motion-duration-slow) var(--motion-ease-out);
}
/* The caption follows once the camera arrived. */
.caption-enter-active {
  transition-delay: 0.9s;
}
.caption-enter-from,
.caption-leave-to {
  opacity: 0;
  transform: translateY(18px);
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

:root[data-reduced-motion] .scene-current {
  animation: none;
}
</style>
