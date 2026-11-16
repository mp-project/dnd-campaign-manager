<script setup lang="ts">
/**
 * Public start page, one address per language (`/`, `/en`): what Chronik is for, who it serves,
 * the main features with screenshots of the clickdummy, the marketplace and the way to the demo
 * and to the registration. It asks the API nothing: a visitor without a session would otherwise
 * cost a failed refresh. Who already has a profile loaded in this tab gets the way into the app
 * instead of the sign-in.
 */
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import BrandMark from "@/components/layout/BrandMark.vue";
import CompassRose from "@/components/layout/CompassRose.vue";
import { meQuery } from "@/core/auth/session";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { usePageMeta } from "@/core/i18n/pageMeta";

import LanguageSwitch from "../components/LanguageSwitch.vue";
import ScreenFrame from "../components/ScreenFrame.vue";
import SplitShowcase from "../components/SplitShowcase.vue";
import { demoScreenUrl, demoUrl } from "../demo";
import { type Screen, SCREENS } from "../screens";

const { t } = useAppI18n();
const demo = demoUrl();
const marketplaceDemo = demoScreenUrl(SCREENS.marketplace.demoPath);
const base = import.meta.env.BASE_URL;

usePageMeta({ title: () => t("landing.meta.title"), description: () => t("landing.meta.description") });

// Only what this tab already knows: never fetched here.
const me = useQuery({ ...meQuery, enabled: false });
const signedIn = computed(() => !!me.data.value);

type Feature = {
  id: string;
  icon: IconName;
  title: MessageKey;
  text: MessageKey;
  points: MessageKey[];
  screen: Screen;
  /** Where the picture goes from md on: beside the text, or across the full width below it. */
  layout: "left" | "right" | "wide";
};

/** Grid of a feature row and order of its text, per layout. */
const LAYOUT = {
  left: { row: "md:grid-cols-[3fr_2fr]", text: "md:order-last" },
  right: { row: "md:grid-cols-[2fr_3fr]", text: "" },
  wide: { row: "", text: "md:grid md:grid-cols-2 md:gap-x-12" },
} as const;

const audience: Array<{ id: string; icon: IconName; title: MessageKey; text: MessageKey }> = [
  { id: "gm", icon: "orig-krone", title: "landing.audience.gameMasters.title", text: "landing.audience.gameMasters.text" },
  { id: "players", icon: "orig-wuerfel", title: "landing.audience.players.title", text: "landing.audience.players.text" },
  { id: "editors", icon: "orig-buch", title: "landing.audience.editors.title", text: "landing.audience.editors.text" },
];

/**
 * The main features in reading order. Pictures beside the text alternate with full-width ones
 * (storyline canvas, character sheet), so the page doesn't only swing left and right.
 */
const features: Feature[] = [
  {
    id: "campaigns",
    icon: "nav-kampagne",
    title: "landing.features.campaigns.title",
    text: "landing.features.campaigns.text",
    points: ["landing.features.campaigns.point1", "landing.features.campaigns.point2", "landing.features.campaigns.point3"],
    screen: SCREENS.map,
    layout: "left",
  },
  {
    id: "storylines",
    icon: "nav-storylines",
    title: "landing.features.storylines.title",
    text: "landing.features.storylines.text",
    points: [
      "landing.features.storylines.point1",
      "landing.features.storylines.point2",
      "landing.features.storylines.point3",
    ],
    screen: SCREENS.storyline,
    layout: "wide",
  },
  {
    id: "quests",
    icon: "nav-quests",
    title: "landing.features.quests.title",
    text: "landing.features.quests.text",
    points: ["landing.features.quests.point1", "landing.features.quests.point2", "landing.features.quests.point3"],
    screen: SCREENS.quest,
    layout: "left",
  },
  {
    id: "characters",
    icon: "nav-charaktere",
    title: "landing.features.characters.title",
    text: "landing.features.characters.text",
    points: [
      "landing.features.characters.point1",
      "landing.features.characters.point2",
      "landing.features.characters.point3",
    ],
    screen: SCREENS.character,
    layout: "wide",
  },
  {
    id: "sessions",
    icon: "nav-sessions",
    title: "landing.features.sessions.title",
    text: "landing.features.sessions.text",
    points: ["landing.features.sessions.point1", "landing.features.sessions.point2", "landing.features.sessions.point3"],
    screen: SCREENS.sessions,
    layout: "right",
  },
];

const more: Array<{ id: string; icon: IconName; title: MessageKey; text: MessageKey }> = [
  { id: "compendium", icon: "nav-kompendium", title: "landing.more.compendium.title", text: "landing.more.compendium.text" },
  { id: "reveals", icon: "nav-freigaben", title: "landing.more.reveals.title", text: "landing.more.reveals.text" },
  { id: "history", icon: "ui-hourglass", title: "landing.more.history.title", text: "landing.more.history.text" },
  { id: "languages", icon: "ui-globe", title: "landing.more.languages.title", text: "landing.more.languages.text" },
];
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-navy-950 text-parchment">
    <header class="border-b border-navy-line">
      <div class="mx-auto flex max-w-300 items-center gap-2 px-4 py-3 md:px-10 md:py-4">
        <BrandMark class="min-w-0" />
        <div class="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <a
            v-if="demo"
            :href="demo"
            target="_blank"
            rel="noopener"
            class="hidden min-h-11 items-center px-2 text-[15px] hover:underline md:inline-flex"
          >
            {{ t("landing.header.demo") }}
          </a>
          <LanguageSwitch />
          <BaseButton
            v-if="signedIn"
            to="/dashboard"
            variant="outline-gold"
            size="sm"
          >
            {{ t("landing.header.toApp") }}
          </BaseButton>
          <template v-else>
            <RouterLink
              :to="{ name: 'auth-login' }"
              class="hidden min-h-11 items-center px-2 text-[15px] hover:underline sm:inline-flex"
            >
              {{ t("landing.header.signIn") }}
            </RouterLink>
            <BaseButton
              :to="{ name: 'auth-login' }"
              variant="outline-gold"
              size="sm"
              class="sm:hidden"
            >
              {{ t("landing.header.signIn") }}
            </BaseButton>
            <BaseButton
              :to="{ name: 'auth-register' }"
              variant="outline-gold"
              size="sm"
              class="hidden sm:inline-flex"
            >
              {{ t("landing.header.register") }}
            </BaseButton>
          </template>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <!-- Hero: dark like the app's shell, with storyline and character sheet split diagonally -->
      <section
        class="relative overflow-hidden"
        aria-labelledby="landing-title"
      >
        <img
          :src="`${base}assets/deko/bergmotiv-navigation.svg`"
          alt=""
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 bottom-0 w-full opacity-10"
        >
        <div
          class="relative mx-auto grid max-w-300 items-center gap-10 px-4 py-12 md:px-10 md:py-20 lg:grid-cols-[5fr_6fr]"
        >
          <div>
            <p class="eyebrow text-gold-light">
              {{ t("landing.hero.eyebrow") }}
            </p>
            <h1
              id="landing-title"
              class="mt-3 font-heading text-[34px] leading-tight font-bold text-parchment md:text-[48px]"
            >
              {{ t("landing.hero.title") }}
            </h1>
            <p class="mt-5 max-w-150 text-[18px] text-parchment/85">
              {{ t("landing.hero.lead") }}
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <BaseButton
                v-if="signedIn"
                to="/dashboard"
                variant="primary"
                icon-right="aktion-weiter"
              >
                {{ t("landing.hero.toApp") }}
              </BaseButton>
              <BaseButton
                v-else
                :to="{ name: 'auth-register' }"
                variant="primary"
              >
                {{ t("landing.hero.register") }}
              </BaseButton>
              <BaseButton
                v-if="demo"
                as="a"
                :href="demo"
                target="_blank"
                rel="noopener"
                variant="outline-gold"
                icon="aktion-ansehen"
              >
                {{ t("landing.hero.demo") }}
              </BaseButton>
            </div>
            <p
              v-if="demo"
              class="mt-3 text-[14px] text-parchment/70"
            >
              {{ t("landing.hero.demoHint") }}
            </p>
          </div>
          <SplitShowcase />
        </div>
      </section>

      <!-- Who it is for -->
      <section
        class="parchment on-parchment text-ink"
        aria-labelledby="landing-audience"
      >
        <div class="mx-auto max-w-300 px-4 py-14 md:px-10 md:py-20">
          <h2
            id="landing-audience"
            class="page-title text-center"
          >
            {{ t("landing.audience.title") }}
          </h2>
          <p class="mx-auto mt-3 max-w-160 text-center text-[17px] text-ink-2">
            {{ t("landing.audience.intro") }}
          </p>
          <ul class="mt-10 grid gap-5 md:grid-cols-3">
            <li
              v-for="item in audience"
              :key="item.id"
              class="card flex flex-col items-center px-6 py-7 text-center shadow-soft"
            >
              <span class="flex size-14 items-center justify-center rounded-full border border-gold bg-parchment text-brand">
                <Icon
                  :name="item.icon"
                  :size="32"
                />
              </span>
              <h3 class="section-title mt-4">
                {{ t(item.title) }}
              </h3>
              <p class="mt-2 text-ink-2">
                {{ t(item.text) }}
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- Main features, each with a screen of the clickdummy -->
      <section
        class="bg-backdrop text-ink"
        aria-labelledby="landing-features"
      >
        <div class="mx-auto max-w-300 px-4 py-14 md:px-10 md:py-20">
          <p class="eyebrow text-center text-brand">
            {{ t("landing.features.eyebrow") }}
          </p>
          <h2
            id="landing-features"
            class="page-title mt-2 text-center"
          >
            {{ t("landing.features.title") }}
          </h2>
          <p class="mx-auto mt-3 max-w-160 text-center text-[17px] text-ink-2">
            {{ t("landing.features.intro") }}
          </p>
          <div class="mt-12 flex flex-col gap-14 md:gap-20">
            <article
              v-for="feature in features"
              :key="feature.id"
              class="grid items-center gap-6 md:gap-12"
              :class="[LAYOUT[feature.layout].row, feature.layout === 'wide' && 'md:gap-8']"
              :aria-labelledby="`landing-feature-${feature.id}`"
            >
              <div :class="LAYOUT[feature.layout].text">
                <div>
                  <div class="flex items-center gap-4">
                    <span class="flex size-14 shrink-0 items-center justify-center rounded-full bg-navy-950 text-gold-light">
                      <Icon
                        :name="feature.icon"
                        :size="32"
                      />
                    </span>
                    <h3
                      :id="`landing-feature-${feature.id}`"
                      class="section-title text-[24px]"
                    >
                      {{ t(feature.title) }}
                    </h3>
                  </div>
                  <p class="mt-4 text-[17px] text-ink-2">
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
                      class="mt-0.5 shrink-0 text-ok"
                    />
                    <span>{{ t(point) }}</span>
                  </li>
                </ul>
              </div>
              <ScreenFrame :screen="feature.screen" />
            </article>
          </div>

          <h3 class="section-title mt-20 text-center">
            {{ t("landing.more.title") }}
          </h3>
          <!-- Mobile: a row to swipe through; from sm on a grid -->
          <ul
            class="scroll-thin -mx-4 mt-6 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4"
          >
            <li
              v-for="item in more"
              :key="item.id"
              class="card w-4/5 shrink-0 snap-start px-5 py-4 sm:w-auto sm:border-0 sm:bg-transparent sm:p-0"
            >
              <p class="flex items-center gap-2 font-heading text-[17px] font-bold text-heading">
                <Icon
                  :name="item.icon"
                  :size="24"
                  class="shrink-0 text-brand"
                />
                {{ t(item.title) }}
              </p>
              <p class="mt-2 text-ink-2">
                {{ t(item.text) }}
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- Marketplace: the screen tilted in space, straightening up when pointed at -->
      <section
        class="relative overflow-hidden"
        aria-labelledby="landing-marketplace"
      >
        <div class="marketplace-glow pointer-events-none absolute inset-0" />
        <div
          class="relative mx-auto grid max-w-300 items-center gap-10 px-4 py-14 md:px-10 md:py-24 lg:grid-cols-[2fr_3fr]"
        >
          <div>
            <p class="eyebrow text-gold-light">
              {{ t("landing.marketplace.eyebrow") }}
            </p>
            <h2
              id="landing-marketplace"
              class="mt-2 font-heading text-[28px] leading-tight font-bold text-parchment md:text-[36px]"
            >
              {{ t("landing.marketplace.title") }}
            </h2>
            <p class="mt-4 text-[17px] text-parchment/85">
              {{ t("landing.marketplace.text") }}
            </p>
            <BaseButton
              v-if="marketplaceDemo"
              as="a"
              :href="marketplaceDemo"
              target="_blank"
              rel="noopener"
              variant="outline-gold"
              icon="nav-marketplace"
              class="mt-6"
            >
              {{ t("landing.marketplace.demo") }}
            </BaseButton>
          </div>
          <div class="tilt-stage">
            <ScreenFrame
              :screen="SCREENS.marketplace"
              class="tilt"
            />
          </div>
        </div>
      </section>

      <!-- Closing call to action -->
      <section
        class="border-t border-navy-line"
        aria-labelledby="landing-cta"
      >
        <div class="mx-auto flex max-w-200 flex-col items-center px-4 py-14 text-center md:py-20">
          <div
            class="flex items-center justify-center gap-4"
            aria-hidden="true"
          >
            <span class="h-px w-16 bg-gold/70" />
            <CompassRose :size="56" />
            <span class="h-px w-16 bg-gold/70" />
          </div>
          <h2
            id="landing-cta"
            class="mt-4 font-heading text-[28px] leading-tight font-bold text-parchment md:text-[36px]"
          >
            {{ t("landing.cta.title") }}
          </h2>
          <p class="mt-3 max-w-150 text-[17px] text-parchment/85">
            {{ t("landing.cta.text") }}
          </p>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <BaseButton
              v-if="signedIn"
              to="/dashboard"
              variant="primary"
              icon-right="aktion-weiter"
            >
              {{ t("landing.hero.toApp") }}
            </BaseButton>
            <BaseButton
              v-else
              :to="{ name: 'auth-register' }"
              variant="primary"
            >
              {{ t("landing.hero.register") }}
            </BaseButton>
            <BaseButton
              v-if="demo"
              as="a"
              :href="demo"
              target="_blank"
              rel="noopener"
              variant="outline-gold"
              icon="aktion-ansehen"
            >
              {{ t("landing.hero.demo") }}
            </BaseButton>
          </div>
          <RouterLink
            v-if="!signedIn"
            :to="{ name: 'auth-login' }"
            class="mt-5 inline-flex min-h-11 items-center text-[15px] text-gold-light underline underline-offset-4"
          >
            {{ t("landing.cta.signIn") }}
          </RouterLink>
        </div>
      </section>
    </main>

    <footer class="flex items-center justify-center gap-4 border-t border-navy-line py-3 text-[14px] text-parchment/80">
      <RouterLink
        :to="{ name: 'legal-privacy' }"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.legal.privacy") }}
      </RouterLink>
      <span
        class="h-4 w-px bg-navy-line"
        aria-hidden="true"
      />
      <RouterLink
        :to="{ name: 'legal-imprint' }"
        class="inline-flex min-h-11 items-center px-2 hover:underline"
      >
        {{ t("common.legal.imprint") }}
      </RouterLink>
    </footer>
  </div>
</template>

<style scoped>
.marketplace-glow {
  background: radial-gradient(ellipse at 70% 50%, color-mix(in srgb, var(--color-gold) 22%, transparent), transparent 60%);
}

.tilt-stage {
  perspective: 1800px;
}
.tilt {
  transform: rotateY(-14deg) rotateX(6deg) rotateZ(1deg);
  transform-origin: 40% 50%;
  box-shadow: 30px 40px 60px -20px color-mix(in srgb, var(--color-navy-950) 90%, transparent);
  transition: transform 0.6s ease;
}
.tilt-stage:hover .tilt,
.tilt:focus-within,
.tilt:focus-visible {
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .tilt {
    transition: none;
  }
}
</style>
