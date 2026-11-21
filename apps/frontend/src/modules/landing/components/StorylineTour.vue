<script setup lang="ts">
/**
 * The storyline feature as a camera ride over the clickdummy's act board, on navy. The board is
 * drawn live (`StorylineBoard`, in board pixels) and fills a large stage; the camera moves from
 * section to section along one route. Once it arrived, the board marks the way on its own
 * elements: the travelled connections turn bright gold, the current section gets a glowing gold
 * frame, passed ones keep a frame, and what is off the route fades. Visitors switch between the
 * two routes, jump to a section, pause the ride or show the whole board. Along a route the camera
 * pans; to the other route it pulls back on the way to its start and moves in again (GSAP). The
 * ride starts once the stage is in view and rests while it is out of view; with reduced motion
 * it doesn't play by itself and jumps instead of moving. The stage leads nowhere; the demo link
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

import { demoScreenUrl } from "@/core/demo";
import { SCREENS } from "../screens";
import { BOARD_HEIGHT, BOARD_WIDTH, RIDES, type RouteId, sectionById } from "../storylineBoard";
import StorylineBoard from "./StorylineBoard.vue";

/** A section the camera visits, with the caption the tour gives it. */
type Stop = { id: string; title: MessageKey; text: MessageKey };
type Route = { id: RouteId; label: MessageKey; stops: Stop[] };

const { t } = useAppI18n();
const screen = SCREENS.storyline;
const demo = demoScreenUrl(screen.demoPath);
/** How long the ride rests on a section once the camera arrived and the way is marked. */
const REST_MS = 2600;

/** The caption of each visited section (`landing.storylineTour.stops.<name>`). */
const STOP_NAME: Record<string, string> = {
  S00: "start",
  S01: "bribe",
  S04: "gate",
  S06: "watch",
  E1: "light",
  S03: "tunnel",
  S05: "below",
  S07: "vault",
  E2: "mist",
};
const stopOf = (id: string): Stop => ({
  id,
  // i18n-dynamic: landing.storylineTour.stops.*
  title: `landing.storylineTour.stops.${STOP_NAME[id]}.title` as MessageKey,
  text: `landing.storylineTour.stops.${STOP_NAME[id]}.text` as MessageKey,
});

const routes: Record<RouteId, Route> = {
  official: { id: "official", label: "landing.storylineTour.routes.official", stops: RIDES.official.map(stopOf) },
  secret: { id: "secret", label: "landing.storylineTour.routes.secret", stops: RIDES.secret.map(stopOf) },
};

const routeId = ref<RouteId>("official");
const index = ref(0);
/** The whole board instead of one section: at first, and when asked for. */
const overview = ref(true);
const playing = ref(false);
const reduceMotion = useReducedMotion();

const route = computed(() => routes[routeId.value]);
const stop = computed(() => route.value.stops[index.value] ?? route.value.stops[0]!);
const routeOptions = computed(() =>
  (Object.values(routes) as Route[]).map((entry) => ({ value: entry.id, label: t(entry.label) })),
);

// ---- Marks on the board ----------------------------------------------------------------------

type Marks = { current: string | null; traveled: string[]; passed: string[]; focus: RouteId | null };
const NO_MARKS: Marks = { current: null, traveled: [], passed: [], focus: null };

/** What the board shows for a route up to a section: the way there, the sections passed. */
function marksFor(id: RouteId, upTo: number, whole: boolean): Marks {
  if (whole) return NO_MARKS;
  const ids = RIDES[id];
  return {
    current: ids[upTo] ?? null,
    passed: ids.slice(0, upTo),
    traveled: ids.slice(0, upTo).map((from, position) => `${from}-${ids[position + 1]}`),
    focus: id,
  };
}

/** Set once the camera arrived, so the way lights up where the visitor looks. */
const marks = ref<Marks>(NO_MARKS);

// ---- Camera ---------------------------------------------------------------------------------

const frame = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });

type Camera = { x: number; y: number; scale: number };
type Point = { x: number; y: number };

const centerOf = (id: string): Point => {
  const s = sectionById[id]!;
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
};

/**
 * The stage is the board in board pixels, moved and scaled from its top left corner. A section
 * shows about 1700 board pixels on wide frames and 680 on phones (about three cards and one and a
 * half), so its text stays readable; `pullBack` below 1 shows more of the board around `focus`
 * (the camera's arc between two sections). The camera never leaves the board and never shows
 * the frame's ground above or below it; without a focus it shows the whole board.
 */
function cameraAt(focus: Point | null, pullBack = 1): Camera {
  const { width, height } = size.value;
  if (!width || !height) return { x: 0, y: 0, scale: 1 };
  const whole = width / BOARD_WIDTH;
  if (!focus) return { x: 0, y: Math.max(0, (height - BOARD_HEIGHT * whole) / 2), scale: whole };
  const fill = height / BOARD_HEIGHT;
  const visible = Math.min(1700, Math.max(680, width * 1.25));
  const scale = Math.max(fill, whole, Math.max(width / visible, fill) * pullBack);
  const clamp = (value: number, min: number) => Math.min(0, Math.max(min, value));
  // On phones the caption covers the lower part of the stage, so the section sits higher.
  const centerY = width < 768 ? height * 0.34 : height / 2;
  return {
    x: clamp(width / 2 - focus.x * scale, width - BOARD_WIDTH * scale),
    y: clamp(centerY - focus.y * scale, height - BOARD_HEIGHT * scale),
    scale,
  };
}

// ---- Motion ---------------------------------------------------------------------------------

/**
 * How long the camera travels. Along a route it pans from section to section; to the other route
 * it pulls back on the way to its start and moves in again.
 */
const MOVE = { pan: 1.8, out: 1, in: 1.4 };
/** How far the camera pulls back when it changes routes. */
const PULL_BACK = 0.62;

/** The step animation running now: the camera, then the marks. */
let ride: gsap.core.Timeline | undefined;
/** The section and route the camera shows now: a new route makes the camera pull back on its way. */
let shown: string | null = null;
let shownRoute: RouteId = routeId.value;

const transform = (camera: Camera) => ({ x: camera.x, y: camera.y, scale: camera.scale });

/** Moves the camera to the current view: at once (resize, reduced motion), or as a ride. */
function showView(immediate: boolean): void {
  const el = stage.value;
  if (!el) return;
  ride?.kill();
  ride = undefined;
  const target = overview.value ? null : stop.value.id;
  const camera = cameraAt(target ? centerOf(target) : null);
  const from = shown;
  const routeChanged = shownRoute !== routeId.value;
  const next = marksFor(routeId.value, index.value, overview.value);
  shown = target;
  shownRoute = routeId.value;

  if (immediate || reduceMotion.value) {
    gsap.set(el, transform(camera));
    marks.value = next;
    return;
  }

  // Going back or to the overview, the old marks leave at once; new ones wait for the camera.
  if (overview.value || routeChanged || (marks.value.focus === routeId.value && marks.value.passed.length > index.value)) {
    marks.value = overview.value ? NO_MARKS : { ...NO_MARKS, focus: routeId.value };
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
  ride.call(() => {
    marks.value = next;
  }, [], ride.duration() - 0.5);
  // The ride goes on once this step is done and the section had a moment.
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
      >
        <StorylineBoard
          :label="t(screen.alt)"
          :current="marks.current"
          :traveled="marks.traveled"
          :passed="marks.passed"
          :focus="marks.focus"
        />
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
  /* Moved and scaled by GSAP. No will-change: the browser paints the board again at the final scale, so text ends up sharp. */
  transform-origin: 0 0;
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
  transition-delay: 1.6s;
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

</style>
