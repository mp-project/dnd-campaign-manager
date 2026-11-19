<script setup lang="ts">
/**
 * The inventory feature as a living list of Arvel Merad's items: it plays a small loop in which
 * loot is taken in, the list sorts itself by category and by quantity, a healing potion is drunk,
 * the spellbook goes to another character and a new potion is bought. Rows move to their new
 * place (GSAP Flip), new ones slide in and gone ones out, pressed buttons spring, quantities jump
 * and the carrying load follows. The visitor can sort and use items; the loop then stops and
 * leaves the list to them. With reduced motion nothing moves and the loop doesn't play by itself.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import SegmentedControl from "@/components/base/SegmentedControl.vue";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";
import type { MessageKey } from "@/core/i18n/keys";
import { Flip, gsap, motionEase, ScrollTrigger } from "@/core/motion/gsap";
import { useReducedMotion } from "@/core/motion/reducedMotion";
import { useGsap } from "@/core/motion/useGsap";

import bronzeSeal from "../assets/items/bronzenes-siegel.webp";
import potion from "../assets/items/heiltrank.webp";
import longsword from "../assets/items/langschwert.webp";
import travelPack from "../assets/items/reisebeutel.webp";
import spellbook from "../assets/items/zauberbuch.webp";

const { t } = useAppI18n();
const { number } = useFormat();

type Category = "weapon" | "consumable" | "provisions" | "adventuring" | "container" | "quest";
type ItemId = "longsword" | "javelin" | "potion" | "rations" | "torch" | "rope" | "pack" | "seal" | "spellbook";
type Item = {
  id: ItemId;
  category: Category;
  /** Weight of one piece in kg (5E 2024, metric edition). */
  weight: number;
  image?: string;
  icon?: IconName;
  worn?: boolean;
  usable?: boolean;
};
type Row = Item & { qty: number };
type SortKey = "name" | "category" | "quantity";

const ITEMS: Record<ItemId, Item> = {
  longsword: { id: "longsword", category: "weapon", weight: 1.5, image: longsword, worn: true },
  javelin: { id: "javelin", category: "weapon", weight: 1, icon: "ui-crosshair", worn: true },
  potion: { id: "potion", category: "consumable", weight: 0.25, image: potion, usable: true },
  rations: { id: "rations", category: "provisions", weight: 1, icon: "orig-gegenstand-truhe", usable: true },
  torch: { id: "torch", category: "adventuring", weight: 0.5, icon: "ui-sparkle", usable: true },
  rope: { id: "rope", category: "adventuring", weight: 2.5, icon: "ui-link" },
  pack: { id: "pack", category: "container", weight: 2.5, image: travelPack, worn: true },
  seal: { id: "seal", category: "quest", weight: 0, image: bronzeSeal },
  spellbook: { id: "spellbook", category: "adventuring", weight: 1.5, image: spellbook },
};

/** As in the clickdummy's inventory of Arvel Merad. */
const START: Array<[ItemId, number]> = [
  ["longsword", 1],
  ["javelin", 3],
  ["potion", 2],
  ["rations", 5],
  ["torch", 6],
  ["rope", 1],
  ["pack", 1],
  ["seal", 1],
];
/** Strength 14 × 7.5 kg. */
const CAPACITY = 105;
const HEALING = 9;
const EVENT_MS = 2800;

const rows = ref<Row[]>(START.map(([id, qty]) => ({ ...ITEMS[id], qty })));
const sort = ref<SortKey>("name");
/** The row that just changed, lit for a moment. */
const lit = ref<ItemId | null>(null);
const event = ref<{ key: number; icon: IconName; label: string; tone: "add" | "use" | "sort" | "give" } | null>(null);
const delta = ref<{ key: number; id: ItemId; text: string } | null>(null);
let eventKey = 0;
/** Light and rising number end after a moment (also under reduced motion). */
const FLASH_MS = 1600;
let flashCall: gsap.core.Tween | undefined;

/** The button just pressed (by the visitor or by the loop): red for a moment, it gives and springs back. */
const PRESS_MS = 700;
const pressed = ref<ItemId | "add" | null>(null);
let pressCall: gsap.core.Tween | undefined;

function press(id: ItemId | "add") {
  pressed.value = id;
  pressCall?.kill();
  pressCall = gsap.delayedCall(PRESS_MS / 1000, () => (pressed.value = null));
  const button = panel.value?.querySelector(`[data-press="${id}"]`);
  if (!button || reduceMotion.value) return;
  gsap
    .timeline()
    .to(button, { scale: 0.86, duration: 0.12, ease: motionEase("out") })
    .to(button, { scale: 1, duration: 0.6, ease: "elastic.out(1.2, 0.4)" });
}

function flash() {
  flashCall?.kill();
  flashCall = gsap.delayedCall(FLASH_MS / 1000, () => {
    lit.value = null;
    delta.value = null;
  });
}

const itemName = (id: ItemId) => t(`landing.inventory.items.${id}` as MessageKey);
const categoryName = (category: Category) => t(`landing.inventory.categories.${category}` as MessageKey);
// i18n-dynamic: landing.inventory.items.*, landing.inventory.categories.*

const sorted = computed(() => {
  const byName = (a: Row, b: Row) => itemName(a.id).localeCompare(itemName(b.id));
  return [...rows.value].sort((a, b) => {
    if (sort.value === "category") return categoryName(a.category).localeCompare(categoryName(b.category)) || byName(a, b);
    if (sort.value === "quantity") return b.qty - a.qty || byName(a, b);
    return byName(a, b);
  });
});

const load = computed(() => rows.value.reduce((sum, row) => sum + row.weight * row.qty, 0));
const kg = (value: number) => number(value, { maximumFractionDigits: 1 });

const sortOptions = computed(() => [
  { value: "name" as const, label: t("landing.inventory.sort.name") },
  { value: "category" as const, label: t("landing.inventory.sort.category") },
  { value: "quantity" as const, label: t("landing.inventory.sort.quantity") },
]);

function announce(icon: IconName, label: string, tone: "add" | "use" | "sort" | "give", id: ItemId | null = null) {
  eventKey += 1;
  event.value = { key: eventKey, icon, label, tone };
  lit.value = id;
  delta.value = null;
  flash();
}

function changeQty(id: ItemId, by: number) {
  const row = rows.value.find((entry) => entry.id === id);
  if (!row) return;
  row.qty = Math.max(0, row.qty + by);
  // The quantity jumps when it changes.
  const qty = panel.value?.querySelector(`[data-qty="${id}"]`);
  if (qty && !reduceMotion.value) gsap.fromTo(qty, { scale: 1.6 }, { scale: 1, duration: 0.6, ease: motionEase("spring") });
}

function addSpellbook() {
  if (rows.value.some((row) => row.id === "spellbook")) return;
  press("add");
  rows.value = [...rows.value, { ...ITEMS.spellbook, qty: 1 }];
  announce("aktion-hinzufuegen", t("landing.inventory.events.loot", { item: itemName("spellbook") }), "add", "spellbook");
}

function giveSpellbook() {
  rows.value = rows.value.filter((row) => row.id !== "spellbook");
  announce("ui-users", t("landing.inventory.events.give", { item: itemName("spellbook") }), "give");
}

function sortBy(key: SortKey) {
  sort.value = key;
  const label = sortOptions.value.find((option) => option.value === key)?.label ?? "";
  announce("ui-sort", t("landing.inventory.events.sorted", { by: label }), "sort");
}

function use(id: ItemId) {
  const row = rows.value.find((entry) => entry.id === id);
  if (!row || row.qty === 0) return;
  press(id);
  changeQty(id, -1);
  if (id === "potion") {
    announce("ui-heart", t("landing.inventory.events.potion", { n: HEALING }), "use", id);
    delta.value = { key: eventKey, id, text: t("landing.inventory.healing", { n: HEALING }) };
  } else {
    announce("ui-check", t("landing.inventory.events.used", { item: itemName(id), n: row.qty }), "use", id);
    delta.value = { key: eventKey, id, text: "−1" };
  }
}

function buyPotion() {
  changeQty("potion", 1);
  sort.value = "name";
  announce("orig-warenkorb", t("landing.inventory.events.bought", { item: itemName("potion") }), "add", "potion");
  delta.value = { key: eventKey, id: "potion", text: "+1" };
}

// ---- The loop, while in view; it stops for good once the visitor takes over ------------------

const STORY: Array<() => void> = [
  addSpellbook,
  () => sortBy("category"),
  () => use("potion"),
  () => sortBy("quantity"),
  giveSpellbook,
  buyPotion,
];

const stage = ref<HTMLElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const loadBar = ref<HTMLElement | null>(null);
const reduceMotion = useReducedMotion();
let step = 0;
let stopped = false;
let next: gsap.core.Tween | undefined;

/** The next event of the loop; each one plans the one after it. */
function schedule() {
  next?.kill();
  next = gsap.delayedCall(EVENT_MS / 1000, () => {
    STORY[step % STORY.length]!();
    step += 1;
    schedule();
  });
}

function takeOver() {
  stopped = true;
  next?.kill();
  next = undefined;
}

function chooseSort(key: SortKey) {
  takeOver();
  sortBy(key);
}

function useByHand(id: ItemId) {
  takeOver();
  use(id);
}

function addByHand() {
  takeOver();
  addSpellbook();
}

// ---- Motion -----------------------------------------------------------------------------------

/** The carrying load as a bar, scaled instead of resized. */
function paintLoad(immediate: boolean) {
  if (!loadBar.value) return;
  const scaleX = Math.min(1, load.value / CAPACITY);
  if (immediate || reduceMotion.value) gsap.set(loadBar.value, { scaleX });
  else gsap.to(loadBar.value, { scaleX, duration: 0.8, ease: motionEase("out") });
}
watch(load, () => paintLoad(false));

/** When the order changes, every row glides from its old place to its new one (Flip). */
const order = () => sorted.value.map((row) => row.id).join();
let before: Flip.FlipState | undefined;
const rowsIn = () => gsap.utils.toArray<HTMLElement>(list.value?.querySelectorAll(".row:not(.row-leaving)") ?? []);
watch(order, () => (before = reduceMotion.value ? undefined : Flip.getState(rowsIn())), { flush: "pre" });
watch(
  order,
  () => {
    if (!before) return;
    Flip.from(before, { targets: rowsIn(), duration: 0.7, ease: motionEase("in-out") });
    before = undefined;
  },
  { flush: "post" },
);

/** New rows slide in from the right, rows that go slide out to the left while the others close up. */
function rowEnter(el: Element, done: () => void) {
  if (reduceMotion.value) return done();
  gsap.fromTo(
    el,
    { autoAlpha: 0, x: 60, scale: 0.94 },
    { autoAlpha: 1, x: 0, scale: 1, duration: 0.6, ease: motionEase("out"), clearProps: "transform,opacity,visibility", onComplete: done },
  );
}
function rowLeave(el: Element, done: () => void) {
  if (reduceMotion.value) return done();
  const row = el as HTMLElement;
  row.classList.add("row-leaving");
  gsap.set(row, { position: "absolute", top: row.offsetTop, left: 0, right: 0 });
  gsap.to(row, { autoAlpha: 0, x: -60, duration: 0.5, ease: motionEase("in-out"), onComplete: done });
}

/** The row that changed lights up and swells for a moment. */
watch(lit, async (id) => {
  if (!id || reduceMotion.value) return;
  await nextTick();
  const row = list.value?.querySelector(`[data-row="${id}"]`);
  if (!row) return;
  gsap
    .timeline()
    .fromTo(row, { scale: 1 }, { scale: 1.04, duration: 0.25, ease: motionEase("out") })
    .to(row, { scale: 1, duration: 0.5, ease: motionEase("spring") });
});

/** What a use or a purchase changed rises beside the quantity and fades away upwards. */
function deltaEnter(el: Element, done: () => void) {
  if (reduceMotion.value) return done();
  gsap.fromTo(el, { autoAlpha: 0, y: 14, scale: 0.7 }, { autoAlpha: 1, y: 0, scale: 1.15, duration: 0.5, ease: motionEase("spring"), onComplete: done });
}
function deltaLeave(el: Element, done: () => void) {
  if (reduceMotion.value) return done();
  gsap.to(el, { autoAlpha: 0, y: -18, duration: 0.5, ease: motionEase("out"), onComplete: done });
}

/**
 * The loop plays while the list is in view and stops for good once the visitor takes over; with
 * reduced motion it doesn't play by itself.
 */
useGsap(stage, ({ reduced }) => {
  paintLoad(true);
  if (!reduced) {
    ScrollTrigger.create({
      trigger: stage.value,
      start: "top 70%",
      end: "bottom 30%",
      onToggle: (self) => {
        if (stopped) return;
        if (!self.isActive) next?.pause();
        else if (next) next.resume();
        else schedule();
      },
    });
  }
  return () => {
    next?.kill();
    next = undefined;
  };
});

onBeforeUnmount(() => {
  flashCall?.kill();
  pressCall?.kill();
});

const hasSpellbook = computed(() => rows.value.some((row) => row.id === "spellbook"));
</script>

<template>
  <div
    ref="stage"
    class="inventory-stage"
  >
    <!-- What just happened -->
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
          :key="event.key"
          class="event-chip"
          :class="`event-${event.tone}`"
        >
          <Icon
            :name="event.icon"
            :size="16"
          />
          {{ event.label }}
        </span>
      </Transition>
    </div>

    <section
      ref="panel"
      class="panel"
      :aria-label="t('landing.inventory.title')"
    >
      <header class="flex items-center gap-2 border-b border-gold/60 pb-2 md:gap-3 md:pb-3">
        <Icon
          name="orig-truhe"
          :size="32"
          class="chest shrink-0 text-gold"
        />
        <div class="min-w-0 flex-1">
          <p class="font-heading text-[18px] font-bold text-heading md:text-[20px]">
            {{ t("landing.inventory.title") }}
          </p>
          <p class="truncate text-[13px] text-ink-2 md:text-[14px]">
            {{ t("landing.inventory.owner") }}
          </p>
        </div>
        <BaseButton
          size="sm"
          variant="secondary"
          icon="aktion-hinzufuegen"
          :disabled="hasSpellbook && pressed !== 'add'"
          class="pressable add"
          :class="{ 'is-pressed': pressed === 'add' }"
          data-press="add"
          :aria-label="t('landing.inventory.add')"
          @click="addByHand"
        >
          {{ t("landing.inventory.add") }}
        </BaseButton>
      </header>

      <SegmentedControl
        :model-value="sort"
        :options="sortOptions"
        :label="t('landing.inventory.sortLabel')"
        class="sort mt-3"
        @update:model-value="chooseSort($event as SortKey)"
      />

      <div ref="list">
        <TransitionGroup
          tag="ul"
          :css="false"
          class="relative mt-2 flex flex-col gap-1 md:mt-3 md:gap-1.5"
          @enter="rowEnter"
          @leave="rowLeave"
        >
          <li
            v-for="row in sorted"
            :key="row.id"
            class="row"
            :data-row="row.id"
            :class="{ 'row-lit': lit === row.id, 'row-empty': row.qty === 0 }"
          >
            <span class="thumb">
              <img
                v-if="row.image"
                :src="row.image"
                alt=""
                width="40"
                height="40"
                class="size-full object-contain"
              >
              <Icon
                v-else-if="row.icon"
                :name="row.icon"
                :size="24"
                class="text-gold"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-heading text-[14px] leading-tight font-bold text-heading md:text-[16px]">
                {{ itemName(row.id) }}
              </span>
              <span class="flex flex-wrap items-center gap-x-2 text-[12px] leading-tight text-ink-2 md:text-[13px]">
                {{ categoryName(row.category) }}
                <span
                  v-if="row.worn"
                  class="worn"
                >{{ t("landing.inventory.worn") }}</span>
              </span>
            </span>
            <span class="qty">
              <span class="text-ink-3">×</span>
              <span
                :data-qty="row.id"
                class="inline-block"
              >{{ row.qty }}</span>
              <Transition
                :css="false"
                @enter="deltaEnter"
                @leave="deltaLeave"
              >
                <span
                  v-if="delta && delta.id === row.id"
                  :key="delta.key"
                  class="delta"
                  :class="delta.text.startsWith('−') ? 'text-danger' : 'text-ok'"
                  aria-hidden="true"
                >{{ delta.text }}</span>
              </Transition>
            </span>
            <span class="action">
              <BaseButton
                v-if="row.usable"
                size="xs"
                variant="secondary"
                :disabled="row.qty === 0 && pressed !== row.id"
                class="pressable"
                :class="{ 'is-pressed': pressed === row.id }"
                :data-press="row.id"
                :aria-label="t('landing.inventory.useItem', { item: itemName(row.id) })"
                @click="useByHand(row.id)"
              >
                {{ t("landing.inventory.use") }}
              </BaseButton>
            </span>
          </li>
        </TransitionGroup>
      </div>

      <!-- Carrying load follows the quantities -->
      <div class="mt-2 border-t border-gold/60 pt-2 md:mt-4 md:pt-3">
        <p class="flex items-center justify-between text-[14px] text-ink-2">
          <span class="inline-flex items-center gap-1.5">
            <Icon
              name="ui-scale"
              :size="16"
              class="text-brand"
            />
            {{ t("landing.inventory.load") }}
          </span>
          <span class="font-heading font-bold text-heading">
            {{ t("landing.inventory.loadValue", { load: kg(load), capacity: kg(CAPACITY) }) }}
          </span>
        </p>
        <div class="bar mt-2">
          <span
            ref="loadBar"
            class="bar-fill"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.inventory-stage {
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
.event-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 14px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
}
.event-add {
  border-color: var(--color-ok);
  background: var(--color-ok-soft);
  color: var(--color-ok);
}
.event-use {
  border-color: var(--color-danger);
  background: var(--color-danger-soft);
  color: var(--color-danger);
}
.event-sort {
  border-color: var(--color-gold);
  background: var(--color-navy-950);
  color: var(--color-gold-light);
}
.event-give {
  border-color: var(--color-violet);
  background: var(--color-violet-soft);
  color: var(--color-violet);
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

/* ---- The panel ---- */
.panel {
  padding: 16px;
  border: 1px solid var(--color-gold);
  border-radius: var(--radius-card);
  background: var(--color-parchment-card);
  box-shadow: var(--shadow-popover);
}
@media (min-width: 48rem) {
  .panel {
    padding: 20px 22px;
  }
}
/* The sort control fills the panel on phones, three equal buttons. */
.sort :deep(button) {
  padding-inline: 8px;
  font-size: 15px;
}

.row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 6px 10px;
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-parchment);
}
.row-lit {
  animation: lit 1.6s ease;
}
@keyframes lit {
  0%,
  40% {
    border-color: var(--color-gold);
    box-shadow:
      0 0 0 2px var(--color-gold-light),
      0 0 18px color-mix(in srgb, var(--color-gold-light) 60%, transparent);
  }
}
.row-empty .thumb,
.row-empty .qty {
  opacity: 0.45;
}
.thumb {
  display: flex;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}
.worn {
  padding: 0 8px;
  border-radius: 999px;
  background: var(--color-tag-gold);
  color: var(--color-tag-gold-ink);
  font-size: 12px;
}
.qty {
  position: relative;
  min-width: 2.5rem;
  font-family: var(--font-heading);
  font-size: 17px;
  font-weight: 700;
  color: var(--color-heading);
  text-align: right;
}
.action {
  display: flex;
  width: 6.5rem;
  flex-shrink: 0;
  justify-content: flex-end;
}
@media (max-width: 47.99rem) {
  .action {
    width: auto;
    min-width: 0;
  }
}
/* Pressed buttons turn red for a moment; GSAP lets them give and spring back. */
.pressable {
  transition:
    background-color 0.3s ease,
    border-color 0.3s ease,
    color 0.3s ease;
}
.pressable.is-pressed {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: var(--color-parchment-card);
}

/* What a use or a purchase changed, rising beside the quantity. */
.delta {
  position: absolute;
  top: 50%;
  right: calc(100% + 8px);
  margin-top: -0.8em;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--color-parchment-card);
  box-shadow: var(--shadow-soft);
  white-space: nowrap;
  font-family: var(--font-heading);
  font-size: 17px;
  font-weight: 700;
  pointer-events: none;
}

.bar {
  position: relative;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--color-neutral-soft);
}
/* Scaled by GSAP to the share of the capacity. */
.bar-fill {
  position: absolute;
  inset: 0;
  background: var(--color-brand);
  transform-origin: 0 50%;
  transform: scaleX(0);
}

/*
 * Phones: everything tighter, so the whole list fits on one screen and every change stays in
 * sight; the add button keeps only its icon.
 */
@media (max-width: 47.99rem) {
  .panel {
    padding: 10px 12px 12px;
  }
  .chest {
    width: 26px;
    height: 26px;
  }
  .add :deep(span) {
    display: none;
  }
  .sort {
    margin-top: 8px;
  }
  .sort :deep(button) {
    min-height: 36px;
    font-size: 14px;
  }
  .row {
    gap: 8px;
    min-height: 44px;
    padding: 3px 8px;
  }
  .thumb {
    width: 30px;
    height: 30px;
  }
  .qty {
    min-width: 2rem;
    font-size: 15px;
  }
  .event-row {
    min-height: 32px;
    margin-bottom: 8px;
  }
  .event-chip {
    padding: 4px 12px;
    font-size: 14px;
  }
}
:root[data-reduced-motion] .row-lit {
  animation: none;
}
</style>
