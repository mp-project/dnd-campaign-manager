<script setup lang="ts">
/**
 * The character feature as the sheet with its most important values beside it: the screenshot of
 * Arvel Merad's sheet stays large, and armor class, hit points, spell slots and a Strength check sit
 * around it, tied to their place by golden lines (on phones two above and two below it, the lines
 * measured from the rendered layout). Nothing moves
 * around; the values change: the sheet plays a small adventure in which Arvel takes hits and casts
 * spells until a long rest, shown over the sheet, fills hit points and spell slots again. The
 * Strength check is a d20 the visitor can roll. The values pop in the first time the sheet is in
 * view; changes move with GSAP (bars, the jumping number, rising deltas, the spinning die). With
 * reduced motion the adventure doesn't play by itself and the die shows its result at once.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n, useGlossary } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { gsap, motionEase, ScrollTrigger } from "@/core/motion/gsap";
import { useReducedMotion } from "@/core/motion/reducedMotion";
import { useGsap } from "@/core/motion/useGsap";

import { SCREENS } from "../screens";
import ScreenFrame from "./ScreenFrame.vue";

const { t } = useAppI18n();
const { term } = useGlossary();

const MAX_HP = 74;
const SLOT_MAX = [4, 3, 2];
const HIT = 12;
const STRENGTH_MODIFIER = 2;
/** How long each event stays on screen; the long rest gets more time. */
const EVENT_MS = 2600;
const REST_MS = 4800;

type EventKind = "hit" | "cast" | "rest";
/** The adventure, played in a loop: two rounds of a hit and a spell, then a long rest. */
const STORY: EventKind[] = ["hit", "cast", "hit", "cast", "rest"];

type Sheet = { hp: number; temp: number; slots: number[] };
type Event = { kind: EventKind; hpDelta: string | null; slotDelta: string | null; label: string };

/** As on the screenshot. */
const sheet = ref<Sheet>({ hp: 58, temp: 5, slots: [3, 2, 1] });
const event = ref<Event | null>(null);
const step = ref(0);
const resting = computed(() => event.value?.kind === "rest");

/** One event of the adventure: changes the sheet and says what happened. */
function apply(kind: EventKind) {
  const { hp, temp, slots } = sheet.value;
  if (kind === "hit") {
    // Temporary hit points go first.
    const absorbed = Math.min(temp, HIT);
    sheet.value = { hp: Math.max(1, hp - (HIT - absorbed)), temp: temp - absorbed, slots };
    event.value = { kind, hpDelta: `−${HIT}`, slotDelta: null, label: t("landing.characterSheet.events.hit", { n: HIT }) };
    return;
  }
  if (kind === "cast") {
    // The highest slot that is left.
    const level = slots.reduce((highest, count, index) => (count > 0 ? index : highest), -1);
    if (level < 0) return;
    sheet.value = { hp, temp, slots: slots.map((count, index) => (index === level ? count - 1 : count)) };
    event.value = { kind, hpDelta: null, slotDelta: "−1", label: t("landing.characterSheet.events.cast", { n: level + 1 }) };
    return;
  }
  sheet.value = { hp: MAX_HP, temp: 0, slots: [...SLOT_MAX] };
  event.value = {
    kind,
    hpDelta: `+${MAX_HP - hp}`,
    slotDelta: t("landing.characterSheet.restored"),
    label: t("landing.characterSheet.events.rest"),
  };
}

// ---- Strength check ---------------------------------------------------------------------------

const roll = ref<number | null>(null);
const rolling = ref(false);
const shown = ref(20);
const die = ref<HTMLElement | null>(null);
let rollAnimation: gsap.core.Timeline | undefined;

const d20 = () => Math.floor(Math.random() * 20) + 1;

/** The die spins twice and grows while its face flickers, then lands on the result with a bounce. */
function rollCheck() {
  if (rolling.value) return;
  const result = d20();
  const finish = () => {
    shown.value = result;
    roll.value = result;
    rolling.value = false;
  };
  if (reduceMotion.value || !die.value) {
    finish();
    return;
  }
  rolling.value = true;
  const faces = { flip: 0 };
  let last = 0;
  rollAnimation = gsap
    .timeline({ onComplete: finish })
    .to(die.value, { rotation: "+=720", duration: 0.9, ease: motionEase("out") }, 0)
    .to(die.value, { scale: 1.3, duration: 0.3, ease: motionEase("out") }, 0)
    .to(
      faces,
      {
        flip: 12,
        duration: 0.85,
        ease: "none",
        onUpdate: () => {
          if (Math.floor(faces.flip) === last) return;
          last = Math.floor(faces.flip);
          shown.value = d20();
        },
      },
      0,
    )
    .to(die.value, { scale: 1, duration: 0.5, ease: motionEase("spring") }, 0.75);
}

const rollText = computed(() => {
  if (roll.value === null) return t("landing.characterSheet.rollPrompt");
  const total = roll.value + STRENGTH_MODIFIER;
  if (roll.value === 20) return t("landing.characterSheet.critical", { total });
  return t("landing.characterSheet.rollResult", { roll: roll.value, modifier: STRENGTH_MODIFIER, total });
});

// ---- Values that change -----------------------------------------------------------------------

const hpValue = ref<HTMLElement | null>(null);
const hpBar = ref<HTMLElement | null>(null);
const tempBar = ref<HTMLElement | null>(null);

/** The bars follow the hit points; the temporary ones sit right after them. A long rest fills slower. */
function paintBars(immediate: boolean) {
  if (!hpBar.value || !tempBar.value) return;
  const hp = sheet.value.hp / MAX_HP;
  const temp = sheet.value.temp / MAX_HP;
  const vars = { duration: resting.value ? 1.6 : 0.8, ease: motionEase("out") };
  if (immediate || reduceMotion.value) {
    gsap.set(hpBar.value, { scaleX: hp });
    gsap.set(tempBar.value, { xPercent: hp * 100, scaleX: temp });
    return;
  }
  gsap.to(hpBar.value, { ...vars, scaleX: hp });
  gsap.to(tempBar.value, { ...vars, xPercent: hp * 100, scaleX: temp });
}

watch(
  () => sheet.value.hp,
  () => {
    paintBars(false);
    if (reduceMotion.value || !hpValue.value) return;
    // The number jumps when it changes.
    gsap.fromTo(hpValue.value, { scale: 1.45 }, { scale: 1, duration: 0.7, ease: motionEase("spring") });
  },
);
watch(() => sheet.value.temp, () => paintBars(false));

/** Deltas rise from the value, grow and fade away upwards. */
function deltaEnter(el: Element, done: () => void) {
  if (reduceMotion.value) return done();
  gsap.fromTo(
    el,
    { autoAlpha: 0, y: 14, scale: 0.7 },
    { autoAlpha: 1, y: 0, scale: 1.2, duration: 0.5, ease: motionEase("spring"), onComplete: done },
  );
}
function deltaLeave(el: Element, done: () => void) {
  if (reduceMotion.value) return done();
  gsap.to(el, { autoAlpha: 0, y: -22, scale: 1, duration: 0.6, ease: motionEase("out"), onComplete: done });
}

// ---- Playing while in view --------------------------------------------------------------------

const stage = ref<HTMLElement | null>(null);
const sheetEl = ref<HTMLElement | null>(null);
const screenEl = ref<HTMLElement | null>(null);
const reduceMotion = useReducedMotion();
let next: gsap.core.Tween | undefined;
let resize: ResizeObserver | undefined;

/** The next event of the adventure; each one plans the one after it. */
function schedule(delay: number) {
  next?.kill();
  next = gsap.delayedCall(delay / 1000, () => {
    const kind = STORY[step.value % STORY.length]!;
    step.value += 1;
    apply(kind);
    schedule(kind === "rest" ? REST_MS : EVENT_MS);
  });
}

/**
 * The values around the sheet pop in one after another the first time it is in view, then the
 * adventure plays; it rests while the sheet is out of view. With reduced motion everything is
 * there at once and nothing plays by itself.
 */
useGsap(stage, ({ reduced }) => {
  paintBars(true);
  if (reduced) return;
  const cards = gsap.utils.toArray<HTMLElement>(".piece > *");
  gsap.set(cards, { autoAlpha: 0, y: 30, scale: 0.75 });
  let started = false;
  ScrollTrigger.create({
    trigger: stage.value,
    start: "top 70%",
    end: "bottom 30%",
    onToggle: (self) => {
      if (!self.isActive) {
        next?.pause();
        return;
      }
      if (started) {
        next?.resume();
        return;
      }
      started = true;
      gsap.to(cards, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: motionEase("spring"),
        stagger: 0.15,
        clearProps: "transform,opacity,visibility",
      });
      schedule(EVENT_MS);
    },
  });
  return () => {
    next?.kill();
    next = undefined;
    rollAnimation?.progress(1);
  };
});

onMounted(() => {
  measureLines();
  if (typeof ResizeObserver !== "undefined" && sheetEl.value) {
    resize = new ResizeObserver(() => measureLines());
    resize.observe(sheetEl.value);
  }
});

onBeforeUnmount(() => resize?.disconnect());

/**
 * Where each value sits around the sheet (`x`/`y`, top left corner), the place on the sheet it
 * belongs to (`ax`/`ay`) and where its line ends (`ex`/`ey`), all in percent of the sheet's width
 * and height.
 */
const pieces = {
  ac: { x: -11, y: 22, ax: 24.6, ay: 41, ex: 2.6, ey: 35 },
  hp: { x: 50, y: -10, ax: 42.3, ay: 37, ex: 56, ey: 4 },
  slots: { x: 80, y: 42, ax: 56, ay: 53, ex: 82, ey: 54 },
  dice: { x: 16, y: 88, ax: 38, ay: 69, ex: 26, ey: 92 },
} as const;

type PieceId = keyof typeof pieces;
type Line = { id: PieceId; x1: number; y1: number; x2: number; y2: number };

/**
 * Phones: the values sit in rows above and below the sheet, so their lines are measured from the
 * rendered layout (px within the sheet). Each line runs from the value's place on the sheet to the
 * nearest edge of its card, straight up or down where the card's width allows it.
 */
const mobileLines = ref<Line[]>([]);
const mobileSize = ref({ width: 0, height: 0 });

function measureLines() {
  const box = sheetEl.value?.getBoundingClientRect();
  const screen = screenEl.value?.getBoundingClientRect();
  if (!box || !screen || window.matchMedia?.("(min-width: 48rem)").matches) {
    mobileLines.value = [];
    return;
  }
  const lines: Line[] = [];
  for (const id of Object.keys(pieces) as PieceId[]) {
    const card = sheetEl.value?.querySelector(`[data-piece="${id}"]`)?.getBoundingClientRect();
    if (!card) continue;
    const x1 = screen.left - box.left + (pieces[id].ax / 100) * screen.width;
    const y1 = screen.top - box.top + (pieces[id].ay / 100) * screen.height;
    const above = card.bottom <= screen.top + 1;
    const inset = Math.min(24, card.width / 2);
    const x2 = Math.min(Math.max(x1, card.left - box.left + inset), card.right - box.left - inset);
    const y2 = (above ? card.bottom : card.top) - box.top;
    lines.push({ id, x1, y1, x2, y2 });
  }
  mobileSize.value = { width: box.width, height: box.height };
  mobileLines.value = lines;
}
void nextTick(measureLines);

const pieceStyle = (id: keyof typeof pieces) => ({ "--x": pieces[id].x, "--y": pieces[id].y });
const eventIcon: Record<EventKind, "ui-swords" | "ui-sparkle" | "ui-hourglass"> = {
  hit: "ui-swords",
  cast: "ui-sparkle",
  rest: "ui-hourglass",
};
const restTitle: MessageKey = "landing.characterSheet.events.rest";
</script>

<template>
  <div
    ref="stage"
    class="stage"
    :class="{ resting }"
  >
    <!-- What just happened in the adventure -->
    <div
      class="event-row"
      aria-hidden="true"
    >
      <Transition
        name="event"
        mode="out-in"
      >
        <span
          v-if="event"
          :key="step"
          class="event-chip"
          :class="`event-${event.kind}`"
        >
          <Icon
            :name="eventIcon[event.kind]"
            :size="16"
          />
          {{ event.label }}
        </span>
      </Transition>
    </div>

    <div
      ref="sheetEl"
      class="sheet"
    >
      <div
        ref="screenEl"
        class="screen"
      >
        <ScreenFrame :screen="SCREENS.character" />

        <!-- The long rest, over the sheet -->
        <Transition name="rest">
          <div
            v-if="resting"
            class="rest-veil"
            aria-hidden="true"
          >
            <div class="rest-card">
              <Icon
                name="ui-hourglass"
                :size="32"
                class="text-gold-light"
              />
              <p class="font-heading text-[22px] font-bold text-parchment md:text-[28px]">
                {{ t(restTitle) }}
              </p>
              <p class="text-[14px] text-parchment/85 md:text-[16px]">
                {{ t("landing.characterSheet.restText") }}
              </p>
            </div>
          </div>
        </Transition>

        <svg
          class="links"
          viewBox="0 0 160 100"
          aria-hidden="true"
        >
          <line
            v-for="(piece, id) in pieces"
            :key="id"
            :x1="piece.ax * 1.6"
            :y1="piece.ay"
            :x2="piece.ex * 1.6"
            :y2="piece.ey"
            class="link"
          />
        </svg>
        <span
          v-for="(piece, id) in pieces"
          :key="`dot-${id}`"
          class="anchor"
          :style="{ left: `${piece.ax}%`, top: `${piece.ay}%` }"
          aria-hidden="true"
        />
      </div>

      <!-- Phones: lines from the sheet to the rows above and below it -->
      <svg
        v-if="mobileLines.length"
        class="mobile-links"
        :viewBox="`0 0 ${mobileSize.width} ${mobileSize.height}`"
        aria-hidden="true"
      >
        <g
          v-for="line in mobileLines"
          :key="line.id"
        >
          <line
            :x1="line.x1"
            :y1="line.y1"
            :x2="line.x2"
            :y2="line.y2"
            class="mobile-link"
          />
          <circle
            :cx="line.x2"
            :cy="line.y2"
            r="3"
            class="mobile-link-end"
          />
        </g>
      </svg>

      <ul class="pieces">
        <!-- Armor class as the sheet's shield -->
        <li
          class="piece piece-ac"
          :data-piece="'ac'"
          :style="pieceStyle('ac')"
          aria-hidden="true"
        >
          <div class="piece-shield">
            <span class="shield">
              <svg viewBox="0 0 100 116">
                <path
                  d="M50 4 94 18v38c0 28-19 46-44 56C25 102 6 84 6 56V18Z"
                  class="shield-body"
                />
                <path
                  d="M50 12 86 23.5V56c0 23-15.5 38.5-36 47-20.5-8.5-36-24-36-47V23.5Z"
                  class="shield-line"
                />
              </svg>
              <span class="shield-value">18</span>
            </span>
            <span class="piece-label mt-1 text-center">{{ term("armorClass") }}</span>
          </div>
        </li>

        <!-- Hit points -->
        <li
          class="piece piece-hp"
          :data-piece="'hp'"
          :style="pieceStyle('hp')"
          aria-hidden="true"
        >
          <div
            class="piece-card w-56"
            :class="{ restoring: resting }"
          >
            <p class="piece-label">
              <Icon
                name="ui-heart"
                :size="16"
                class="text-brand"
              />
              {{ term("hitPoints") }}
            </p>
            <p class="mt-1 font-heading text-[26px] leading-none text-heading">
              <span
                ref="hpValue"
                class="inline-block"
              >{{ sheet.hp }}</span>
              <span
                v-if="sheet.temp"
                class="ml-1 text-[15px] text-hp-temp"
              >+{{ sheet.temp }}</span>
              <span class="text-ink-3"> / {{ MAX_HP }}</span>
            </p>
            <div class="bar mt-2">
              <span
                ref="hpBar"
                class="bar-fill bar-hp"
              />
              <span
                ref="tempBar"
                class="bar-fill bar-temp"
              />
            </div>
            <Transition
              :css="false"
              @enter="deltaEnter"
              @leave="deltaLeave"
            >
              <span
                v-if="event?.hpDelta"
                :key="step"
                class="delta"
                :class="event.hpDelta.startsWith('+') ? 'text-ok' : 'text-danger'"
              >{{ event.hpDelta }}</span>
            </Transition>
          </div>
        </li>

        <!-- Spell slots -->
        <li
          class="piece piece-slots"
          :data-piece="'slots'"
          :style="pieceStyle('slots')"
          aria-hidden="true"
        >
          <div
            class="piece-card w-52"
            :class="{ restoring: resting }"
          >
            <p class="piece-label">
              <Icon
                name="ui-star"
                :size="16"
                class="text-brand"
              />
              {{ t("landing.characterSheet.slots") }}
            </p>
            <ul class="mt-2 flex flex-col gap-1.5">
              <li
                v-for="(max, level) in SLOT_MAX"
                :key="level"
                class="flex items-center gap-2 text-[14px] text-ink-2"
              >
                <span class="w-12 shrink-0 md:w-14">{{ t("landing.characterSheet.slotLevel", { n: level + 1 }) }}</span>
                <span
                  v-for="slot in max"
                  :key="slot"
                  class="slot"
                  :class="{ 'slot-full': slot <= (sheet.slots[level] ?? 0) }"
                  :style="resting ? { transitionDelay: `${(level * 4 + slot) * 90}ms` } : undefined"
                />
              </li>
            </ul>
            <p class="slot-note">
              <Transition
                :css="false"
                @enter="deltaEnter"
                @leave="deltaLeave"
              >
                <span
                  v-if="event?.slotDelta"
                  :key="step"
                  class="inline-block"
                  :class="event.kind === 'rest' ? 'text-ok' : 'text-danger'"
                >{{ event.slotDelta }}</span>
              </Transition>
            </p>
          </div>
        </li>

        <!-- Strength check: a d20 to roll -->
        <li
          class="piece piece-dice"
          :data-piece="'dice'"
          :style="pieceStyle('dice')"
        >
          <button
            data-track="landing.characterSheet.roll"
            type="button"
            class="piece-card dice-card"
            :aria-label="t('landing.characterSheet.roll')"
            @click="rollCheck"
          >
            <span
              ref="die"
              class="die"
              :class="{ 'die-critical': roll === 20 && !rolling }"
              aria-hidden="true"
            >
              <svg viewBox="0 0 100 100">
                <path
                  d="M50 4 90 27v46L50 96 10 73V27Z"
                  class="die-body"
                />
                <path
                  d="M50 4 30 62h40ZM10 27l20 35M90 27 70 62M30 62 10 73M70 62l20 11M30 62l20 34 20-34"
                  class="die-edges"
                />
              </svg>
              <span class="die-value">{{ shown }}</span>
            </span>
            <span class="flex min-w-0 flex-col text-left">
              <span class="piece-label">
                <Icon
                  name="aktion-wuerfeln"
                  :size="16"
                  class="text-brand"
                />
                {{ t("landing.characterSheet.check") }}
              </span>
              <span
                class="mt-0.5 text-[15px] text-ink"
                aria-live="polite"
              >{{ rolling ? t("landing.characterSheet.rolling") : rollText }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
}
@media (min-width: 48rem) {
  .stage {
    padding: 64px 9% 72px;
  }
}

.sheet {
  position: relative;
  container-type: inline-size;
}
.screen {
  position: relative;
}

/* ---- What happened ---- */
.event-row {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}
@media (min-width: 48rem) {
  .event-row {
    position: absolute;
    top: 14px;
    left: 9%;
    justify-content: flex-start;
    margin: 0;
  }
}
.event-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
}
.event-hit {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.event-cast {
  border-color: var(--color-violet);
  background: var(--color-violet-soft);
  color: var(--color-violet);
}
.event-rest {
  border-color: var(--color-gold);
  background: var(--color-navy-950);
  color: var(--color-gold-light);
}
.event-enter-active,
.event-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.event-enter-from,
.event-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ---- Long rest over the sheet ---- */
.rest-veil {
  position: absolute;
  top: 0;
  left: 0;
  /* Above the lines and anchors (z-index 1), below the value cards (2, later in the page). */
  z-index: 2;
  display: flex;
  width: 100%;
  aspect-ratio: 16 / 10;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--color-navy-950) 72%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: none;
}
.rest-card {
  display: flex;
  max-width: 80%;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 24px;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: var(--color-navy-950);
  text-align: center;
  box-shadow: 0 0 40px color-mix(in srgb, var(--color-gold) 35%, transparent);
}
.rest-enter-active,
.rest-leave-active {
  transition: opacity 0.5s ease;
}
.rest-enter-from,
.rest-leave-to {
  opacity: 0;
}

/* ---- Lines and anchors ---- */
.links {
  display: none;
}
.anchor {
  position: absolute;
  z-index: 1;
  display: block;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  border: 2px solid var(--color-gold-light);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-gold-light) 35%, transparent);
  pointer-events: none;
}
.mobile-links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.mobile-link {
  stroke: var(--color-gold);
  stroke-width: 1.5;
}
.mobile-link-end {
  fill: var(--color-gold);
}
@media (min-width: 48rem) {
  .mobile-links {
    display: none;
  }
  .links {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: visible;
    pointer-events: none;
  }
  .anchor {
    z-index: auto;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
  }
}
.link {
  stroke: var(--color-gold);
  stroke-width: 0.3;
}

/*
 * ---- Pieces: on phones armor class and hit points above the sheet, the check and the spell slots
 * below it (each below or above its place on the sheet, so the lines don't cross); around it from md on
 */
.pieces {
  display: contents;
}
/* The cards inside pop in with GSAP the first time the sheet is in view. */
.piece {
  position: relative;
  z-index: 2;
}
@media (max-width: 47.99rem) {
  .sheet {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 12px;
    row-gap: 28px;
  }
  .screen {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .piece-ac {
    grid-area: 1 / 1;
  }
  .piece-hp {
    grid-area: 1 / 2;
  }
  .piece-dice {
    grid-area: 3 / 1;
  }
  .piece-slots {
    grid-area: 3 / 2;
  }
}
@media (min-width: 48rem) {
  .piece {
    position: absolute;
    left: calc(var(--x) * 1%);
    top: calc(var(--y) * 0.625cqw);
  }
}

.piece-card {
  position: relative;
  display: block;
  padding: 12px 14px;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: var(--color-parchment-card);
  box-shadow: var(--shadow-popover);
  transition: box-shadow 0.5s ease;
}
@media (max-width: 47.99rem) {
  .piece-card {
    width: 100%;
    height: 100%;
    box-shadow: var(--shadow-soft);
  }
}
/* A long rest lights the values it fills up. */
.piece-card.restoring {
  box-shadow:
    0 0 0 3px var(--color-gold-light),
    0 0 28px color-mix(in srgb, var(--color-gold-light) 70%, transparent);
}
.piece-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-ink-2);
  font-family: var(--font-heading);
  font-size: 14px;
  font-weight: 700;
}


.bar {
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-neutral-soft);
}
/* Both span the bar and are scaled by GSAP; the temporary hit points are moved behind the others. */
.bar-fill {
  position: absolute;
  inset: 0;
  transform-origin: 0 50%;
  transform: scaleX(0);
}
.bar-hp {
  background: var(--color-brand);
}
.bar-temp {
  background: var(--color-hp-temp);
}

.slot {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--color-brand);
  border-radius: 999px;
  transition: background-color 0.4s ease;
}
.slot-full {
  background: var(--color-brand);
}

.delta {
  position: absolute;
  top: 36px;
  right: 12px;
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 700;
  pointer-events: none;
}
/* What changed in the slots, on its own line below them. */
.slot-note {
  min-height: 22px;
  margin-top: 6px;
  font-family: var(--font-heading);
  font-size: 15px;
  font-weight: 700;
}

/* ---- Armor class ---- */
.piece-shield {
  position: relative;
  display: flex;
  width: 132px;
  flex-direction: column;
  align-items: center;
  margin: 0 auto;
}
@media (max-width: 47.99rem) {
  .piece-shield {
    width: 100%;
    height: 100%;
    padding: 12px;
    border: 1px solid var(--color-gold);
    border-radius: var(--radius-card);
    background: var(--color-parchment-card);
    box-shadow: var(--shadow-soft);
  }
}
/* The shield and its value: the value sits in the shield's optical middle, above the tip. */
.shield {
  position: relative;
  display: block;
  width: 104px;
  filter: drop-shadow(0 10px 14px color-mix(in srgb, var(--color-navy-950) 40%, transparent));
}
.shield svg {
  display: block;
  width: 100%;
  height: auto;
}
.shield-body {
  fill: var(--color-primary);
  stroke: var(--color-gold);
  stroke-width: 3;
}
.shield-line {
  fill: none;
  stroke: var(--color-gold-light);
  stroke-width: 1.5;
}
.shield-value {
  position: absolute;
  top: 44%;
  right: 0;
  left: 0;
  transform: translateY(-50%);
  text-align: center;
  color: var(--color-parchment-card);
  font-family: var(--font-heading);
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
}
@media (max-width: 47.99rem) {
  .shield {
    width: 64px;
  }
  .shield-value {
    font-size: 24px;
  }
}
@media (min-width: 48rem) {
  .piece-shield .piece-label {
    padding: 2px 10px;
    border: 1px solid var(--color-gold);
    border-radius: 999px;
    background: var(--color-parchment-card);
  }
}

/* ---- Strength check ---- */
.dice-card {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease;
}
@media (min-width: 48rem) {
  .dice-card {
    width: 17rem;
  }
}
@media (max-width: 47.99rem) {
  .dice-card {
    flex-direction: column;
    gap: 6px;
    text-align: center;
  }
  .dice-card > .flex {
    align-items: center;
    text-align: center;
  }
}
.dice-card:hover {
  border-color: var(--color-primary);
}
.die {
  position: relative;
  display: inline-flex;
  width: 52px;
  height: 52px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}
.die svg {
  position: absolute;
  inset: 0;
}
.die-body {
  fill: var(--color-navy-950);
  stroke: var(--color-gold);
  stroke-width: 3;
}
.die-edges {
  fill: none;
  stroke: var(--color-gold-soft);
  stroke-width: 1.5;
  opacity: 0.6;
}
.die-value {
  position: relative;
  margin-top: 8px;
  color: var(--color-gold-light);
  font-family: var(--font-heading);
  font-size: 17px;
  font-weight: 700;
}
.die-critical .die-body {
  fill: var(--color-primary);
}

:root[data-reduced-motion] .slot,
:root[data-reduced-motion] .piece-card {
  transition: none;
}
</style>
