<script setup lang="ts">
/**
 * Menu of the start page on phones. The trigger is a simple compass rose instead of a burger, its
 * north point red: opening turns it south, towards the menu, closing back north. A parchment scroll unrolls below the
 * header with the page's table of contents (chapters with a golden seal, number and a line on what they hold) and the ways in
 * (registration or sign-in, demo, or the app for a profile already loaded). A chapter closes the
 * scroll and moves the page to its section below the sticky header. Escape, the dimmed page and
 * the compass close it; focus returns to the compass. From md on the header shows its links and
 * the menu is not rendered. With reduced motion nothing turns or unrolls.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { useReducedMotion } from "@/core/motion/reducedMotion";

const props = defineProps<{ signedIn: boolean; demo: string | null }>();

const { t } = useAppI18n();
const route = useRoute();

const open = ref(false);
const top = ref(0);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);

const NUMERALS = ["I", "II", "III", "IV", "V"];
const chapters = computed(() =>
  (
    [
      { section: "landing-audience", icon: "ui-users", label: "landing.menu.audience", hint: "landing.menu.audienceHint" },
      { section: "landing-features", icon: "ui-scroll", label: "landing.menu.features", hint: "landing.menu.featuresHint" },
      { section: "landing-more", icon: "ui-sparkle", label: "landing.menu.more", hint: "landing.menu.moreHint" },
      { section: "landing-marketplace", icon: "ui-building", label: "landing.menu.marketplace", hint: "landing.menu.marketplaceHint" },
      { section: "landing-reputation", icon: "ui-flag", label: "landing.menu.reputation", hint: "landing.menu.reputationHint" },
    ] satisfies { section: string; icon: IconName; label: MessageKey; hint: MessageKey }[]
  ).map((chapter, index) => ({ ...chapter, numeral: NUMERALS[index] })),
);
const base = import.meta.env.BASE_URL;

/** The scroll hangs from the header's lower edge, which moves while the header condenses. */
function measure(): void {
  top.value = trigger.value?.closest("header")?.getBoundingClientRect().bottom ?? 0;
}

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") close();
}
/** Media queries only when asked, so the page renders where `matchMedia` is missing. */
function media(query: string): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
}
let desktop: MediaQueryList | null = null;
function onDesktop(event: MediaQueryListEvent): void {
  if (event.matches) close(false);
}

async function show(): Promise<void> {
  measure();
  open.value = true;
  document.documentElement.style.overflow = "hidden";
  window.addEventListener("keydown", onKey);
  desktop = media("(min-width: 48rem)");
  desktop?.addEventListener("change", onDesktop);
  await nextTick();
  panel.value?.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
}

function close(returnFocus = true): void {
  if (!open.value) return;
  open.value = false;
  document.documentElement.style.overflow = "";
  window.removeEventListener("keydown", onKey);
  desktop?.removeEventListener("change", onDesktop);
  if (returnFocus) trigger.value?.focus({ preventScroll: true });
}

function toggle(): void {
  if (open.value) close();
  else void show();
}

const reduceMotion = useReducedMotion();

function goTo(section: string): void {
  close(false);
  const target = document.querySelector(`[aria-labelledby="${section}"]`);
  if (!(target instanceof HTMLElement)) return;
  const header = trigger.value?.closest("header")?.offsetHeight ?? 0;
  window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - header, behavior: reduceMotion.value ? "auto" : "smooth" });
}

watch(() => route.fullPath, () => close(false));
onBeforeUnmount(() => close(false));

const label = computed(() => t(open.value ? "landing.menu.close" : "landing.menu.open"));
</script>

<template>
  <div class="md:hidden">
    <button
      ref="trigger"
      type="button"
      class="compass inline-flex size-11 items-center justify-center rounded-full text-parchment"
      :class="{ 'is-open': open }"
      :aria-label="label"
      :title="label"
      :aria-expanded="open"
      aria-controls="landing-menu"
      @click="toggle"
    >
      <svg
        viewBox="0 0 32 32"
        width="38"
        height="38"
        aria-hidden="true"
        focusable="false"
        class="compass-rose"
      >
        <g
          v-for="angle in [45, 135, 225, 315]"
          :key="angle"
          :transform="`rotate(${angle} 16 16)`"
        >
          <path
            d="M16 6 L16 16 L14.6 14.6 Z"
            class="ray-minor-dark"
          />
          <path
            d="M16 6 L16 16 L17.4 14.6 Z"
            class="ray-minor-light"
          />
        </g>
        <g
          v-for="angle in [0, 90, 180, 270]"
          :key="angle"
          :transform="`rotate(${angle} 16 16)`"
        >
          <path
            d="M16 1 L16 16 L13.2 13.2 Z"
            :class="angle === 0 ? 'ray-north-dark' : 'ray-dark'"
          />
          <path
            d="M16 1 L16 16 L18.8 13.2 Z"
            :class="angle === 0 ? 'ray-north-light' : 'ray-light'"
          />
        </g>
      </svg>
    </button>

    <Teleport to="body">
      <div
        class="scroll-layer md:hidden"
        :class="{ 'is-open': open }"
        :style="{ top: `${top}px` }"
        :inert="!open"
      >
        <div
          class="scroll-veil"
          aria-hidden="true"
          @click="close()"
        />
        <nav
          id="landing-menu"
          ref="panel"
          class="scroll parchment text-ink"
          :aria-label="t('landing.menu.title')"
        >
          <div class="scroll-body px-6 pt-5 pb-6">
            <p class="menu-title eyebrow text-brand">
              {{ t("landing.menu.title") }}
            </p>
            <ol class="mt-3">
              <li
                v-for="(chapter, index) in chapters"
                :key="chapter.section"
                class="chapter"
                :style="{ '--i': index }"
              >
                <a
                  :href="`#${chapter.section}`"
                  class="chapter-link"
                  @click.prevent="goTo(chapter.section)"
                >
                  <span
                    class="chapter-seal"
                    aria-hidden="true"
                  >
                    <Icon
                      :name="chapter.icon"
                      :size="20"
                    />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="chapter-number eyebrow">{{ t("landing.menu.chapter", { number: chapter.numeral }) }}</span>
                    <span class="block font-heading text-[18px] leading-snug text-heading">{{ t(chapter.label) }}</span>
                    <span class="block text-[14px] leading-snug text-ink-3">{{ t(chapter.hint) }}</span>
                  </span>
                  <Icon
                    name="ui-chevron-right"
                    :size="20"
                    class="chapter-arrow"
                  />
                </a>
              </li>
            </ol>
            <img
              :src="`${base}assets/deko/trennlinie-gold.svg`"
              alt=""
              aria-hidden="true"
              class="chapter mx-auto mt-6 h-3 w-40"
              :style="{ '--i': chapters.length }"
            >

            <div
              class="chapter mt-6 flex flex-col gap-3"
              :style="{ '--i': chapters.length + 1 }"
            >
              <BaseButton
                v-if="props.signedIn"
                to="/dashboard"
                variant="primary"
                icon-right="aktion-weiter"
                block
              >
                {{ t("landing.header.toApp") }}
              </BaseButton>
              <template v-else>
                <BaseButton
                  :to="{ name: 'auth-register' }"
                  variant="primary"
                  block
                >
                  {{ t("landing.header.register") }}
                </BaseButton>
                <BaseButton
                  :to="{ name: 'auth-login' }"
                  variant="secondary"
                  block
                >
                  {{ t("landing.header.signIn") }}
                </BaseButton>
              </template>
              <BaseButton
                v-if="props.demo"
                as="a"
                :href="props.demo"
                target="_blank"
                rel="noopener"
                variant="ghost"
                icon="aktion-ansehen"
                block
              >
                {{ t("landing.hero.demo") }}
              </BaseButton>
            </div>
          </div>
          <div
            class="scroll-rod"
            aria-hidden="true"
          />
        </nav>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Trigger: a compass rose whose red north turns south (towards the menu) while it is open. */
/* Pointed at or focused, a faint golden shimmer behind it, like the marketplace's glow. */
.compass {
  outline: none;
  background: radial-gradient(circle, color-mix(in srgb, var(--color-gold) 38%, transparent), transparent 70%);
  background-color: transparent;
  background-size: 0 0;
  background-position: center;
  background-repeat: no-repeat;
}
.compass:hover,
.compass:focus-visible {
  background-size: 100% 100%;
}
.compass:focus-visible {
  box-shadow: 0 0 0 2px var(--color-gold-light);
}
.ray-light {
  fill: var(--color-parchment);
}
.ray-dark {
  fill: var(--color-gold);
}
.ray-north-light {
  fill: var(--color-alert);
}
.ray-north-dark {
  fill: var(--color-danger);
}
.ray-minor-light {
  fill: var(--color-gold-light);
}
.ray-minor-dark {
  fill: var(--color-navy-700);
}
.compass-rose {
  transform-origin: 50% 50%;
}
.compass.is-open .compass-rose {
  transform: rotate(180deg);
}

/* The scroll: unrolls from the header downward, the rod at its lower edge travelling along. */
.scroll-layer {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  z-index: 20;
  pointer-events: none;
}
.scroll-layer.is-open {
  pointer-events: auto;
}
.scroll-veil {
  position: absolute;
  inset: 0;
  background-color: color-mix(in srgb, var(--color-navy-950) 65%, transparent);
  opacity: 0;
}
.is-open .scroll-veil {
  opacity: 1;
}
.scroll {
  position: relative;
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-bottom: 1px solid var(--color-gold);
  box-shadow: var(--shadow-popover);
  clip-path: inset(0 0 100% 0);
}
.is-open .scroll {
  clip-path: inset(0 0 -12px 0);
}
.scroll-body {
  border-inline: 1px solid var(--color-gold-soft);
  margin-inline: 8px;
}
.scroll-rod {
  position: sticky;
  bottom: 0;
  height: 12px;
  border-block: 1px solid var(--color-gold);
  background:
    linear-gradient(
      var(--color-navy-700),
      var(--color-navy-950) 55%,
      var(--color-navy-900)
    );
}

.chapter {
  opacity: 0;
  transform: translateY(-6px);
}
.is-open .chapter {
  opacity: 1;
  transform: none;
}
.menu-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.menu-title::before,
.menu-title::after {
  content: "";
  flex: 1;
  height: 1px;
}
.menu-title::before {
  background: linear-gradient(to right, transparent, var(--color-gold));
}
.menu-title::after {
  background: linear-gradient(to left, transparent, var(--color-gold));
}

/* One chapter: a golden seal with its icon, number, title and what it is about. */
.chapter-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 56px;
  margin-inline: -10px;
  padding: 9px 10px;
  border-radius: var(--radius-card);
}
li + li .chapter-link::before {
  content: "";
  position: absolute;
  top: 0;
  inset-inline: 10px;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--color-gold-soft) 20%, var(--color-gold-soft) 80%, transparent);
}
.chapter-link:hover,
.chapter-link:active {
  background-color: color-mix(in srgb, var(--color-gold) 10%, transparent);
}
.chapter-link:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: 0;
}
.chapter-seal {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--color-gold);
  border-radius: 999px;
  background: var(--color-parchment-card);
  box-shadow:
    inset 0 0 0 3px var(--color-parchment-card),
    inset 0 0 0 4px var(--color-gold-soft);
  color: var(--color-brand);
}
.chapter-number {
  display: block;
  color: var(--color-gold);
  font-size: 11px;
}
.chapter-arrow {
  flex-shrink: 0;
  color: var(--color-gold);
}
.chapter-link:hover .chapter-arrow,
.chapter-link:active .chapter-arrow {
  transform: translateX(3px);
  color: var(--color-brand);
}

:root:not([data-reduced-motion]) .compass {
  transition: background-size 0.3s ease;
}
:root:not([data-reduced-motion]) .compass-rose {
  transition: transform 0.6s cubic-bezier(0.34, 1.4, 0.64, 1);
}
:root:not([data-reduced-motion]) .scroll {
  transition: clip-path 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}
:root:not([data-reduced-motion]) .scroll-veil {
  transition: opacity 0.3s ease;
}
:root:not([data-reduced-motion]) .chapter-link,
:root:not([data-reduced-motion]) .chapter-arrow {
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}
:root:not([data-reduced-motion]) .is-open .chapter {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  transition-delay: calc(0.15s + var(--i) * 50ms);
}
</style>
