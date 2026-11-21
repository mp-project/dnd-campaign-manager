<script setup lang="ts">
/**
 * The clickdummy's act board of the storyline "Der Nebelpakt", drawn live (desktop layout, in
 * board pixels, `BOARD_WIDTH` × `BOARD_HEIGHT`): act areas on a dotted parchment ground, the
 * connections as curves in their route's colour with arrows and junctions, the labels of the
 * choices and the section cards. It shows, it isn't used: nothing is focusable, and screen readers
 * get `label` for the whole board. Arrows keep one size (in board pixels), however thick their line:
 * a line with an arrow ends in a straight piece before the card, and the head sits on its end.
 *
 * The tour marks its way on the board's own elements: a `traveled` connection gets thicker and
 * the bright gold runs along it from one section to the next (each line's colour is a gradient
 * from its start to its end whose border GSAP moves; then its junction and arrow turn gold too),
 * the `current` section gets a gold frame with a glow once the gold reached it, `passed` sections
 * keep a gold frame, and with a `focus` route everything off the route fades (CSS transitions).
 * Several new connections run one after the other; ones that are no longer travelled lose their
 * gold at once. With reduced motion the gold is there at once.
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { gsap, motionEase } from "@/core/motion/gsap";
import { useReducedMotion } from "@/core/motion/reducedMotion";

import {
  ACTS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type BoardSection,
  DEGREE,
  actText,
  ARROW_LENGTH,
  edgeText,
  layoutBoard,
  type LineColor,
  RIDES,
  type RouteId,
  SECTIONS,
  sectionText,
} from "../storylineBoard";

const props = withDefaults(
  defineProps<{
    label: string;
    current?: string | null;
    traveled?: readonly string[];
    passed?: readonly string[];
    focus?: RouteId | null;
  }>(),
  { current: null, traveled: () => [], passed: () => [], focus: null },
);

const { t } = useAppI18n();
const graph = layoutBoard();

const ROUTE_NAME: Record<RouteId, MessageKey> = {
  official: "landing.storylineTour.routes.official",
  secret: "landing.storylineTour.routes.secret",
};
const traveledSet = computed(() => new Set(props.traveled));

// ---- The gold running along the lines ----------------------------------------------------------

/** One stretch of line the gold runs along: a connection (its key) or a junction (`join-<id>`). */
type Run = { id: string; color: LineColor; x1: number; x2: number };
const runs: Run[] = [
  ...graph.edges.map((edge) => ({ id: edge.key, color: edge.color, x1: edge.x1, x2: edge.x2 })),
  ...graph.joins.map((join) => ({ id: `join-${join.key}`, color: join.color, x1: join.x1, x2: join.x2 })),
];
const joinIds = new Set(graph.joins.map((join) => join.key));
/** A connection, followed by the junction it leads into (if any). */
const runsOf = (edge: string): string[] => {
  const to = edge.split("-")[1]!;
  return joinIds.has(to) ? [edge, `join-${to}`] : [edge];
};

/** Seconds the gold takes along one stretch. */
const RUN_SECONDS = 1.4;
const reduceMotion = useReducedMotion();
const board = ref<HTMLElement | null>(null);
/** Stretches the gold has reached the end of: their arrow (and junction) turn gold. */
const arrived = ref(new Set<string>());
let running: gsap.core.Timeline | undefined;

const stopsOf = (id: string) => board.value?.querySelectorAll(`stop[data-run="${id}"]`) ?? [];

watch(
  () => props.traveled,
  (now) => {
    running?.kill();
    const wanted = now.flatMap(runsOf);
    const keep = new Set(wanted);
    for (const run of runs) {
      if (keep.has(run.id)) continue;
      gsap.set(stopsOf(run.id), { attr: { offset: 0 } });
    }
    const reached = new Set([...arrived.value].filter((id) => keep.has(id)));
    arrived.value = reached;
    const missing = wanted.filter((id) => !reached.has(id));
    if (reduceMotion.value) {
      missing.forEach((id) => gsap.set(stopsOf(id), { attr: { offset: 1 } }));
      arrived.value = new Set(wanted);
      return;
    }
    running = gsap.timeline();
    for (const id of missing) {
      running.to(stopsOf(id), { attr: { offset: 1 }, duration: RUN_SECONDS, ease: motionEase("in-out") });
      running.call(() => {
        arrived.value = new Set([...arrived.value, id]);
      });
    }
  },
  { flush: "post" },
);
onBeforeUnmount(() => running?.kill());
const passedSet = computed(() => new Set(props.passed));
/** Sections and connections of the focused route; the rest fades. */
const onRoute = computed(() => new Set(props.focus ? RIDES[props.focus] : []));
const currentAct = computed(() => SECTIONS.find((s) => s.id === props.current)?.act ?? null);

const edgeFaded = (from: string, to: string) => !!props.focus && !(onRoute.value.has(from) && onRoute.value.has(to));
const joinLit = (key: string) => props.traveled.some((edge) => edge.endsWith(`-${key}`));
const joinArrived = (key: string) => arrived.value.has(`join-${key}`);
/** The junction's dot turns gold once the gold reached it. */
const dotLit = (key: string) => props.traveled.some((edge) => edge.endsWith(`-${key}`) && arrived.value.has(edge));
const joinFaded = (key: string) => !!props.focus && !onRoute.value.has(key);

function headText(s: BoardSection): string {
  if (s.kind === "end") return `${s.id} · ${t(sectionText(s.id, "tag"))}`;
  return [s.id, s.route ? t(ROUTE_NAME[s.route]) : null, t(sectionText(s.id, "tag"))].filter(Boolean).join(" · ");
}

/** The card's last line: the link, or how many ways lead in and on (and for an end how many lead here). */
function footerText(s: BoardSection): string {
  const degree = DEGREE[s.id] ?? { in: 0, out: 0 };
  if (s.kind === "end") return t("landing.storylineBoard.endFooter", degree.in, { n: degree.in });
  if (degree.in > 1 || !s.link) {
    return `${t("landing.storylineBoard.entrances", degree.in, { n: degree.in })} · ${t("landing.storylineBoard.continuations", degree.out, { n: degree.out })}`;
  }
  return t(sectionText(s.id, "link"));
}

/** The current section lights up once the gold reached it. */
const goldArrived = computed(() => props.traveled.flatMap(runsOf).every((id) => arrived.value.has(id)));

function cardState(s: BoardSection) {
  return {
    "is-current": props.current === s.id && goldArrived.value,
    "is-passed": props.current !== s.id && passedSet.value.has(s.id),
    "is-faded": !!props.focus && !onRoute.value.has(s.id),
  };
}

const tone = (s: BoardSection) => (s.kind === "end" ? "tone-end" : s.route === "secret" ? "tone-secret" : "tone-official");
const box = (b: { x: number; y: number; w: number; h: number }) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
</script>

<template>
  <div
    ref="board"
    class="board"
    role="img"
    :aria-label="label"
    :style="{ width: `${BOARD_WIDTH}px`, height: `${BOARD_HEIGHT}px` }"
  >
    <!-- Acts -->
    <section
      v-for="act in ACTS"
      :key="act.n"
      class="act"
      :class="{ 'is-current': currentAct === act.n }"
      :style="box(act)"
      aria-hidden="true"
    >
      <div
        class="absolute top-4"
        :style="{ left: `${act.labelX - act.x}px` }"
      >
        <p class="eyebrow text-gold">
          {{ t(actText(act.n, "title")) }}
        </p>
        <p class="meta">
          {{ t(actText(act.n, "summary")) }}
        </p>
      </div>
    </section>

    <!-- Connections -->
    <svg
      class="lines"
      :width="BOARD_WIDTH"
      :height="BOARD_HEIGHT"
      aria-hidden="true"
    >
      <defs>
        <marker
          v-for="color in ['official', 'secret', 'gold', 'lit']"
          :id="`board-arrow-${color}`"
          :key="color"
          viewBox="0 0 10 10"
          refX="0.5"
          refY="5"
          markerUnits="userSpaceOnUse"
          :markerWidth="ARROW_LENGTH"
          :markerHeight="ARROW_LENGTH"
          orient="auto"
        >
          <path
            :d="color === 'lit' ? 'M0 0 L10 5 L0 10 L1.6 5 Z' : 'M0 1.2 L10 5 L0 8.8 L1.8 5 Z'"
            :class="`arrow-${color}`"
          />
        </marker>
        <!-- Each line's colour: gold up to the border, its own colour after it; GSAP moves the border. -->
        <linearGradient
          v-for="run in runs"
          :id="`board-run-${run.id}`"
          :key="run.id"
          gradientUnits="userSpaceOnUse"
          :x1="run.x1"
          :x2="run.x2"
          y1="0"
          y2="0"
        >
          <stop
            offset="0"
            class="stop-lit"
            :data-run="run.id"
          />
          <stop
            offset="0"
            :class="`stop-${run.color}`"
            :data-run="run.id"
          />
        </linearGradient>
      </defs>
      <path
        v-for="edge in graph.edges"
        :key="edge.key"
        :d="edge.d"
        class="line"
        :stroke="`url(#board-run-${edge.key})`"
        :class="{ 'line-thin': edge.color === 'gold', 'is-lit': traveledSet.has(edge.key), 'is-faded': edgeFaded(edge.edge.from, edge.edge.to) }"
        :marker-end="edge.arrow ? `url(#board-arrow-${arrived.has(edge.key) ? 'lit' : edge.color})` : undefined"
      />
      <g
        v-for="join in graph.joins"
        :key="join.key"
        :class="{ 'is-faded': joinFaded(join.key) }"
        class="join"
      >
        <path
          :d="join.d"
          class="line"
          :stroke="`url(#board-run-join-${join.key})`"
          :class="{ 'is-lit': joinLit(join.key) }"
          :marker-end="`url(#board-arrow-${joinArrived(join.key) ? 'lit' : join.color})`"
        />
        <circle
          :cx="join.x"
          :cy="join.y"
          r="8"
          class="join-dot"
          :class="[`dot-${join.color}`, { 'is-lit': dotLit(join.key) }]"
        />
      </g>
    </svg>

    <!-- Labels of the choices -->
    <div
      v-for="edge in graph.edges.filter((entry) => entry.label)"
      :key="`label-${edge.key}`"
      class="choice"
      :class="{ 'is-lit': traveledSet.has(edge.key), 'is-faded': edgeFaded(edge.edge.from, edge.edge.to) }"
      :style="{ left: `${edge.label!.x}px`, top: `${edge.label!.y}px`, width: `${edge.label!.w}px` }"
      aria-hidden="true"
    >
      <span
        class="text-[15px] font-semibold"
        :class="edge.color === 'secret' ? 'text-navy-700' : 'text-brand'"
      >{{ t("landing.storylineBoard.choice", { choice: t(edgeText(edge.key, "choice")) }) }}</span>
      <span class="meta line-clamp-2">{{ t("landing.storylineBoard.condition", { condition: t(edgeText(edge.key, "condition")) }) }}</span>
    </div>

    <!-- Sections -->
    <template
      v-for="s in SECTIONS"
      :key="s.id"
    >
      <div
        v-if="s.kind === 'start'"
        class="card-start"
        :class="cardState(s)"
        :style="box(s)"
        aria-hidden="true"
      >
        <p class="eyebrow text-gold-light">
          {{ t("landing.storylineBoard.startHead", { id: s.id }) }}
        </p>
        <p class="mt-1 font-heading text-[18px] font-bold">
          {{ t(sectionText(s.id, "title")) }}
        </p>
        <p class="mt-1 text-[13px] text-parchment/85">
          {{ t(sectionText(s.id, "description")) }}
        </p>
      </div>
      <article
        v-else
        class="card-scene"
        :class="[tone(s), cardState(s)]"
        :style="box(s)"
        aria-hidden="true"
      >
        <img
          :src="s.image"
          alt=""
          loading="lazy"
          decoding="async"
          class="h-12 w-full shrink-0 object-cover"
          draggable="false"
        >
        <p class="card-head eyebrow">
          <Icon
            v-if="s.kind === 'end'"
            name="ui-flag"
            :size="13"
          />
          <span class="truncate">{{ headText(s) }}</span>
        </p>
        <div class="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-2">
          <h3 class="truncate font-heading text-[21px] leading-tight font-bold text-heading">
            {{ t(sectionText(s.id, "title")) }}
          </h3>
          <p class="mt-1.5 line-clamp-2 text-[15px] leading-snug text-ink-2">
            {{ t(sectionText(s.id, "description")) }}
          </p>
          <p class="meta mt-2 flex items-center gap-1.5">
            <Icon
              name="ui-pin"
              :size="16"
            />{{ t(sectionText(s.id, "location")) }}
          </p>
          <div class="mt-auto flex items-center gap-2 border-t border-line pt-2">
            <span class="card-accent min-w-0 flex-1 truncate text-[13.5px]">{{ footerText(s) }}</span>
            <Icon
              name="aktion-ansehen"
              :size="20"
              class="card-accent"
            />
          </div>
        </div>
      </article>
    </template>
  </div>
</template>

<style scoped>
.board {
  position: relative;
  background-color: var(--color-parchment-sunk);
  background-image: radial-gradient(circle, color-mix(in srgb, var(--color-gold) 35%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
  user-select: none;
}

.act {
  position: absolute;
  border: 1px solid color-mix(in srgb, var(--color-line) 80%, transparent);
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-parchment) 20%, transparent);
}
.act.is-current {
  border-color: color-mix(in srgb, var(--color-gold) 70%, transparent);
  background: color-mix(in srgb, var(--color-parchment) 40%, transparent);
}

.lines {
  position: absolute;
  top: 0;
  left: 0;
  overflow: visible;
  pointer-events: none;
}
/* Butt ends: a line stops exactly at the base of its arrow head (or at its junction). */
.line {
  fill: none;
  stroke-linecap: butt;
  stroke-width: 3;
}
.line-thin {
  stroke-width: 2;
}
/* A connection the tour travels gets thicker; the gold runs along it through its gradient. */
.line.is-lit {
  stroke-width: 4.5;
}
.stop-lit {
  stop-color: var(--color-gold-bright);
}
.stop-official {
  stop-color: var(--color-primary);
}
.stop-secret {
  stop-color: var(--color-navy-700);
}
.stop-gold {
  stop-color: var(--color-gold);
}
.arrow-official {
  fill: var(--color-primary);
}
.arrow-secret {
  fill: var(--color-navy-700);
}
.arrow-gold {
  fill: var(--color-gold);
}
.arrow-lit {
  fill: var(--color-gold-bright);
}
.dot-official {
  fill: var(--color-primary);
}
.dot-secret {
  fill: var(--color-navy-700);
}
.dot-gold {
  fill: var(--color-gold);
}
.join-dot.is-lit {
  fill: var(--color-gold-bright);
}

.choice {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 10px;
  border: 1px solid color-mix(in srgb, var(--color-gold) 70%, transparent);
  border-radius: var(--radius-control);
  background: var(--color-parchment-card);
  box-shadow: var(--shadow-soft);
  text-align: center;
  transform: translate(-50%, -50%);
}
.choice.is-lit {
  border-color: var(--color-gold-bright);
  box-shadow:
    0 0 0 2px var(--color-gold-bright),
    var(--shadow-soft);
}

.card-start {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-inline: 16px;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: var(--color-navy-900);
  box-shadow: var(--shadow-soft);
  color: var(--color-parchment);
  text-align: center;
}
.card-scene {
  position: absolute;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-parchment-card);
  box-shadow: var(--shadow-soft);
}
.card-head {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  color: var(--color-parchment-card);
}
.tone-official .card-head {
  background: var(--color-primary);
}
.tone-official .card-accent {
  color: var(--color-brand);
}
.tone-secret .card-head {
  background: var(--color-navy-700);
}
.tone-secret .card-accent {
  color: var(--color-navy-700);
}
.tone-end .card-head {
  background: var(--color-earth);
}
.tone-end .card-accent {
  color: var(--color-earth);
}

/* The tour's marks, on the cards themselves: the current section framed and glowing, passed ones framed. */
.card-start.is-current,
.card-scene.is-current {
  border-color: var(--color-gold-bright);
  box-shadow:
    0 0 0 3px var(--color-gold-bright),
    0 0 32px 4px color-mix(in srgb, var(--color-gold-bright) 45%, transparent);
}
.card-start.is-passed,
.card-scene.is-passed {
  border-color: var(--color-gold-bright);
  box-shadow:
    0 0 0 1.5px color-mix(in srgb, var(--color-gold-bright) 70%, transparent),
    var(--shadow-soft);
}
.is-faded {
  opacity: 0.4;
}

:root:not([data-reduced-motion]) .line,
:root:not([data-reduced-motion]) .join,
:root:not([data-reduced-motion]) .join-dot,
:root:not([data-reduced-motion]) .choice,
:root:not([data-reduced-motion]) .card-start,
:root:not([data-reduced-motion]) .card-scene,
:root:not([data-reduced-motion]) .act {
  transition:
    stroke 1.2s ease,
    stroke-width 1.2s ease,
    fill 1.2s ease,
    border-color 1.2s ease,
    box-shadow 1.2s ease,
    background-color 1.2s ease,
    opacity 1s ease;
}
</style>
