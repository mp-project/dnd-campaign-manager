<script setup lang="ts">
/**
 * Public start page, one address per language (`/`, `/en`): what Questaria is for, who it serves,
 * the main features with screenshots of the clickdummy, further features as a slider, the
 * inventory, the marketplace, the reputation system and the way to the demo and to the registration. It asks the API nothing: a visitor without a session would otherwise
 * cost a failed refresh. Who already has a profile loaded in this tab gets the way into the app
 * instead of the sign-in.
 */
import { SUPPORTED_LOCALES } from "@dnd/i18n";
import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import { useRoute } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";
import WingSeal from "@/components/layout/WingSeal.vue";
import PublicHeader from "@/components/layout/PublicHeader.vue";
import type { MenuChapter } from "@/components/layout/PublicMenu.vue";
import SiteFooter from "@/components/layout/SiteFooter.vue";
import { meQuery } from "@/core/auth/session";
import { demoScreenUrl, demoUrl } from "@/core/demo";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { localizedPath, useLocalizedPage } from "@/core/i18n/localizedRoutes";
import { usePageMeta } from "@/core/seo/pageMeta";
import { siteUrl } from "@/core/seo/site";
import { vReveal } from "@/core/motion/reveal";

import CharacterSheetShowcase from "../components/CharacterSheetShowcase.vue";
import FeatureRow, { type FeatureRowData } from "../components/FeatureRow.vue";
import InventoryShowcase from "../components/InventoryShowcase.vue";
import MarketplaceFan from "../components/MarketplaceFan.vue";
import MoreSlider, { type MoreItem } from "../components/MoreSlider.vue";
import compendiumArt from "../assets/more/compendium.webp";
import encountersArt from "../assets/more/encounters.webp";
import factionsArt from "../assets/more/factions.webp";
import historyArt from "../assets/more/history.webp";
import languagesArt from "../assets/more/languages.webp";
import revealsArt from "../assets/more/reveals.webp";
import soundsArt from "../assets/more/sounds.webp";
import audienceEditorArt from "../assets/deco/audience-editor.webp";
import audienceGameMasterArt from "../assets/deco/audience-game-master.webp";
import audiencePlayerArt from "../assets/deco/audience-player.webp";
import booksArt from "../assets/deco/books.webp";
import castleRuinScene from "../assets/deco/castle-ruin.webp";
import coastScene from "../assets/deco/coast.webp";
import coinArt from "../assets/deco/coin.webp";
import forestEdgeScene from "../assets/deco/forest-edge.webp";
import heroArt from "../assets/deco/hero-dragon.webp";
import purseArt from "../assets/deco/purse.webp";
import riverTownScene from "../assets/deco/river-town.webp";
import scrollArt from "../assets/deco/scroll.webp";
import swordArt from "../assets/deco/sword.webp";
import LandscapeEdge from "../components/LandscapeEdge.vue";
import ScreenFrame from "../components/ScreenFrame.vue";
import StorylineTour from "../components/StorylineTour.vue";
import { type Screen, SCREENS } from "../screens";
import { startPageStructuredData } from "../structuredData";

const { t } = useAppI18n();
const demo = demoUrl();
const waitlist = useLocalizedPage("auth-waitlist");
const marketplaceDemo = demoScreenUrl(SCREENS.marketplace.demoPath);

// Only what this tab already knows: never fetched here.
const me = useQuery({ ...meQuery, enabled: false });
const signedIn = computed(() => !!me.data.value);

/** The page's sections as chapters of the phone menu. */
const chapters: MenuChapter[] = [
  { section: "landing-audience", icon: "ui-users", label: "landing.menu.audience", hint: "landing.menu.audienceHint" },
  { section: "landing-features", icon: "ui-scroll", label: "landing.menu.features", hint: "landing.menu.featuresHint" },
  { section: "landing-more", icon: "ui-sparkle", label: "landing.menu.more", hint: "landing.menu.moreHint" },
  { section: "landing-marketplace", icon: "ui-building", label: "landing.menu.marketplace", hint: "landing.menu.marketplaceHint" },
  { section: "landing-reputation", icon: "ui-flag", label: "landing.menu.reputation", hint: "landing.menu.reputationHint" },
];

type Feature = FeatureRowData & {
  screen: Screen;
  /** A wide feature can show its screen as a moving stage instead of a still picture. */
  showcase?: "storylineTour" | "characterSheet";
};

const SHOWCASES = { storylineTour: StorylineTour, characterSheet: CharacterSheetShowcase } as const;

/**
 * Who it is for, each card with a figure leaning on it: the game master tossing dice over the left
 * corner, a half-elf player over the right one, a dwarf chronicler writing on the right edge.
 * `figure` places the picture in shares of the card's width (left, top, width), so it leans the
 * same way at every size.
 */
type AudienceFigure = { src: string; left: number; top: number; width: number };
const audience: Array<{ id: string; icon: IconName; title: MessageKey; text: MessageKey; figure: AudienceFigure }> = [
  {
    id: "gm",
    icon: "orig-krone",
    title: "landing.audience.gameMasters.title",
    text: "landing.audience.gameMasters.text",
    figure: { src: audienceGameMasterArt, left: -9, top: -37, width: 72 },
  },
  {
    id: "players",
    icon: "orig-wuerfel",
    title: "landing.audience.players.title",
    text: "landing.audience.players.text",
    figure: { src: audiencePlayerArt, left: 66.5, top: -25, width: 45.5 },
  },
  {
    id: "editors",
    icon: "orig-buch",
    title: "landing.audience.editors.title",
    text: "landing.audience.editors.text",
    figure: { src: audienceEditorArt, left: 50, top: -30.3, width: 56 },
  },
];

/**
 * The main features in reading order. Pictures beside the text alternate with full-width stages
 * (a camera ride over the storyline canvas, the character sheet with its values floating around
 * it), so the page doesn't only swing left and right.
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
    scene: { src: riverTownScene, side: "right" },
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
    showcase: "storylineTour",
    band: "navy",
    landscape: "etchedHills",
  },
  {
    id: "quests",
    icon: "nav-quests",
    title: "landing.features.quests.title",
    text: "landing.features.quests.text",
    points: ["landing.features.quests.point1", "landing.features.quests.point2", "landing.features.quests.point3"],
    screen: SCREENS.quest,
    layout: "right",
    scene: { src: forestEdgeScene, side: "left" },
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
    showcase: "characterSheet",
    band: "parchment",
  },
  {
    id: "sessions",
    icon: "nav-sessions",
    title: "landing.features.sessions.title",
    text: "landing.features.sessions.text",
    points: ["landing.features.sessions.point1", "landing.features.sessions.point2", "landing.features.sessions.point3"],
    screen: SCREENS.sessions,
    layout: "right",
    scene: { src: coastScene, side: "left" },
  },
];

/** After the further features: the inventory as a list that sorts, takes in and uses items. */
const inventory: FeatureRowData = {
  id: "inventory",
  icon: "orig-truhe",
  title: "landing.features.inventory.title",
  text: "landing.features.inventory.text",
  points: ["landing.features.inventory.point1", "landing.features.inventory.point2", "landing.features.inventory.point3"],
  layout: "left",
};

const route = useRoute();
usePageMeta({
  title: () => t("landing.meta.title"),
  description: () => t("landing.meta.description"),
  structuredData: () => {
    const locale = route.meta.locale ?? "de";
    return startPageStructuredData({
      site: siteUrl(),
      url: `${siteUrl()}${localizedPath("", locale)}`,
      locale,
      name: t("common.app.name"),
      description: t("landing.meta.description"),
      languages: SUPPORTED_LOCALES,
      // The main features as the app's feature list, in the page's language.
      features: [...features, inventory].map((feature) => t(feature.title)),
    });
  },
});

const more: MoreItem[] = [
  { id: "encounters", icon: "nav-encounter", title: "landing.more.encounters.title", text: "landing.more.encounters.text", art: encountersArt },
  { id: "factions", icon: "nav-fraktionen", title: "landing.more.factions.title", text: "landing.more.factions.text", art: factionsArt },
  { id: "sounds", icon: "nav-musik-sounds", title: "landing.more.sounds.title", text: "landing.more.sounds.text", art: soundsArt },
  { id: "compendium", icon: "nav-kompendium", title: "landing.more.compendium.title", text: "landing.more.compendium.text", art: compendiumArt },
  { id: "reveals", icon: "nav-freigaben", title: "landing.more.reveals.title", text: "landing.more.reveals.text", art: revealsArt },
  { id: "history", icon: "ui-hourglass", title: "landing.more.history.title", text: "landing.more.history.text", art: historyArt },
  { id: "languages", icon: "ui-globe", title: "landing.more.languages.title", text: "landing.more.languages.text", art: languagesArt },
];

/** What moves a reputation, in the order of the reputation screen's sources. */
const reputationSources: Array<{ id: string; icon: IconName; label: MessageKey }> = [
  { id: "story", icon: "nav-storylines", label: "landing.reputation.sources.story" },
  { id: "quest", icon: "nav-quests", label: "landing.reputation.sources.quest" },
  { id: "encounter", icon: "nav-encounter", label: "landing.reputation.sources.encounter" },
  { id: "manual", icon: "aktion-bearbeiten", label: "landing.reputation.sources.manual" },
];

const reputationPoints: MessageKey[] = [
  "landing.reputation.point1",
  "landing.reputation.point2",
  "landing.reputation.point3",
];
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-navy-950 text-parchment">
    <PublicHeader :chapters="chapters" />

    <main class="flex-1">
      <!-- Hero: dark like the app's shell, with storyline and character sheet split diagonally -->
      <section
        class="hero relative z-10 flex items-center overflow-x-clip"
        aria-labelledby="landing-title"
      >
        <img
          :src="heroArt"
          alt=""
          aria-hidden="true"
          decoding="async"
          fetchpriority="high"
          class="hero-art pointer-events-none absolute"
        >
        <div class="hero-shade pointer-events-none absolute inset-0 hidden lg:block" />
        <div class="relative mx-auto w-full max-w-400 px-4 pt-20 md:px-10 md:pt-28 lg:pt-32 lg:pb-20">
          <div class="max-w-150">
            <p class="eyebrow text-gold-light">
              {{ t("landing.hero.eyebrow") }}
            </p>
            <h1
              id="landing-title"
              class="mt-3 font-display text-[34px] leading-tight font-bold text-parchment md:text-[48px]"
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
                :to="waitlist"
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
        </div>
      </section>

      <!-- Who it is for -->
      <section
        class="parchment on-parchment overflow-x-clip text-ink"
        aria-labelledby="landing-audience"
      >
        <div class="mx-auto max-w-400 px-4 pt-36 pb-24 md:px-10 md:pt-48 md:pb-32">
          <h2
            id="landing-audience"
            v-reveal
            class="page-title text-center"
          >
            {{ t("landing.audience.title") }}
          </h2>
          <p class="mx-auto mt-3 max-w-160 text-center text-[17px] text-ink-2">
            {{ t("landing.audience.intro") }}
          </p>
          <ul class="mx-auto mt-32 grid max-w-md gap-y-36 px-6 md:mt-28 md:px-0 md:max-w-none md:grid-cols-3 md:gap-x-4 lg:mt-40 lg:gap-x-8 xl:gap-x-12">
            <li
              v-for="(item, position) in audience"
              :key="item.id"
              v-reveal="{ from: 'zoom', delay: position * 160 }"
              class="audience-card card relative flex flex-col items-center px-6 py-7 text-center shadow-soft"
            >
              <img
                :src="item.figure.src"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                class="audience-figure pointer-events-none absolute max-w-none"
                :style="{
                  left: `${item.figure.left}%`,
                  top: `${item.figure.top}cqw`,
                  width: `${item.figure.width}%`,
                }"
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

      <!-- Main features, each with a screen of the clickdummy; some as a navy or parchment band across the page -->
      <section
        class="bg-backdrop pb-32 text-ink md:pb-52"
        aria-labelledby="landing-features"
      >
        <div
          v-reveal
          class="relative mx-auto max-w-400 px-4 pt-20 pb-8 md:px-10 md:pt-28 md:pb-10"
        >
          <WingSeal
            :size="96"
            class="features-seal pointer-events-none absolute top-10 right-10 hidden lg:block"
            aria-hidden="true"
          />
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
        </div>
        <FeatureRow
          v-for="feature in features"
          :key="feature.id"
          :feature="feature"
        >
          <component
            :is="SHOWCASES[feature.showcase]"
            v-if="feature.showcase"
          />
          <ScreenFrame
            v-else
            :screen="feature.screen"
          />
          <template
            v-if="feature.id === 'quests'"
            #decor
          >
            <img
              :src="scrollArt"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              class="prop prop-scroll"
            >
          </template>
          <template
            v-else-if="feature.id === 'characters'"
            #decor
          >
            <img
              :src="swordArt"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              class="prop prop-sword"
            >
          </template>
        </FeatureRow>
      </section>

      <!-- Further features: dark like the footer, as a slider of framed cards -->
      <section
        class="navy-shade relative z-10 overflow-x-clip"
        aria-labelledby="landing-more"
      >
        <LandscapeEdge
          flip
          landscape="etchedHills"
        />
        <div class="more-glow pointer-events-none absolute inset-0" />
        <div
          v-reveal
          class="relative mx-auto max-w-400 px-4 py-20 md:px-10 md:py-28"
        >
          <p class="eyebrow text-center text-gold-light">
            {{ t("landing.more.eyebrow") }}
          </p>
          <h2
            id="landing-more"
            class="mt-2 text-center font-heading text-[28px] leading-tight font-bold text-parchment md:text-[36px]"
          >
            {{ t("landing.more.title") }}
          </h2>
          <p class="mx-auto mt-3 max-w-160 text-center text-[17px] text-parchment/85">
            {{ t("landing.more.intro") }}
          </p>
          <MoreSlider
            :items="more"
            :label="t('landing.more.title')"
            class="mt-10"
          />
        </div>
      </section>

      <!-- Inventory: a living list of Arvel's items -->
      <section
        class="bg-backdrop pt-16 pb-36 text-ink md:pt-24 md:pb-56"
        aria-labelledby="landing-feature-inventory"
      >
        <FeatureRow :feature="inventory">
          <InventoryShowcase />
          <template #decor>
            <img
              :src="purseArt"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              class="prop prop-purse"
            >
            <img
              :src="coinArt"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              class="prop prop-coin"
            >
          </template>
        </FeatureRow>
      </section>

      <!-- Marketplace: official content, the complete bundle and community content as a fan of cards -->
      <section
        class="navy-shade relative z-10 overflow-x-clip"
        aria-labelledby="landing-marketplace"
      >
        <LandscapeEdge />
        <img
          :src="booksArt"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          class="prop prop-books"
        >
        <div class="marketplace-glow pointer-events-none absolute inset-0" />
        <div
          v-reveal
          class="relative mx-auto grid max-w-400 items-center gap-10 px-4 py-20 md:px-10 md:py-32 lg:grid-cols-[2fr_3fr]"
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
          <MarketplaceFan />
        </div>
      </section>

      <!-- Reputation: grows with the story, adjustable by hand -->
      <section
        class="parchment on-parchment relative overflow-x-clip text-ink"
        aria-labelledby="landing-reputation"
      >
        <img
          :src="castleRuinScene"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          class="reputation-scene pointer-events-none absolute"
        >
        <div
          v-reveal
          class="relative mx-auto grid max-w-400 items-center gap-10 px-4 pt-20 pb-36 md:px-10 md:pt-32 md:pb-52 lg:grid-cols-[3fr_2fr]"
        >
          <div class="lg:order-last">
            <p class="eyebrow text-brand">
              {{ t("landing.reputation.eyebrow") }}
            </p>
            <h2
              id="landing-reputation"
              class="page-title mt-2"
            >
              {{ t("landing.reputation.title") }}
            </h2>
            <p class="mt-4 text-[17px] text-ink-2">
              {{ t("landing.reputation.text") }}
            </p>
            <ul
              class="mt-5 flex flex-wrap items-center gap-2"
              :aria-label="t('landing.reputation.sourcesLabel')"
            >
              <li
                v-for="source in reputationSources"
                :key="source.id"
                class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[14px]"
                :class="source.id === 'manual' ? 'border-brand bg-primary-soft text-brand' : 'border-gold bg-parchment-card text-ink'"
              >
                <Icon
                  :name="source.icon"
                  :size="16"
                  class="shrink-0"
                />
                {{ t(source.label) }}
              </li>
            </ul>
            <ul class="mt-6 flex flex-col gap-2">
              <li
                v-for="point in reputationPoints"
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
          <ScreenFrame :screen="SCREENS.reputation" />
        </div>
      </section>
    </main>

    <SiteFooter heading-id="landing-cta" />
  </div>
</template>

<style scoped>
/*
 * Hero: the dragon on moonlit ruins (1709 × 920). Row 814 is the last fully opaque one; below it
 * the torn paper edge thins out over the light section that follows, so the picture hangs 11.5 % of its
 * height below the hero (which stays above that section). The hero is at least as tall as the
 * opaque part, the text sits on the open sky at the left. Below lg the picture stands under the
 * text, so the dragon stays free; where the hero is taller, its top fades into the navy.
 */
.hero {
  --hero-art-width: max(100vw, 900px);
  min-height: calc(var(--hero-art-width) * 814 / 1709);
  padding-bottom: calc(var(--hero-art-width) * 0.42);
  background-color: var(--color-navy-950);
}
.hero-art {
  right: 0;
  bottom: 0;
  width: var(--hero-art-width);
  max-width: none;
  transform: translateY(11.5%);
  mask-image: linear-gradient(to bottom, transparent, black 25%);
}
/* Keeps the text readable where the constellation reaches under it on narrower screens. */
.hero-shade {
  background: linear-gradient(
    to right,
    color-mix(in srgb, var(--color-navy-950) 70%, transparent),
    color-mix(in srgb, var(--color-navy-950) 45%, transparent) 40%,
    transparent 62%
  );
}
@media (min-width: 1024px) {
  .hero {
    padding-bottom: 0;
  }
  .hero-art {
    mask-image: linear-gradient(to bottom, transparent, black 10%);
  }
}

/* The card is the container its figure is measured against (`cqw` for the height above it). */
.audience-card {
  container-type: inline-size;
  transition:
    transform var(--motion-duration-slow) var(--motion-ease-standard),
    box-shadow var(--motion-duration-slow) var(--motion-ease-standard);
}
.audience-figure {
  z-index: 1;
  height: auto;
}
.audience-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 36px -20px color-mix(in srgb, var(--color-ink) 45%, transparent);
}

.features-seal {
  opacity: 0.45;
}

.reputation-scene {
  top: 1.5rem;
  right: -1rem;
  width: min(50%, 520px);
  opacity: 0.32;
  mask-image: linear-gradient(to left, black 50%, transparent);
}
@media (min-width: 1024px) {
  .reputation-scene {
    top: auto;
    bottom: 0;
    right: 0;
    width: min(36%, 640px);
    opacity: 0.34;
  }
}

/* Props from the adventurer's pack at the edges of rows and sections; only where there is room. */
.prop {
  position: absolute;
  display: none;
  max-width: none;
  pointer-events: none;
  filter: drop-shadow(0 10px 14px color-mix(in srgb, var(--color-navy-950) 30%, transparent));
}
@media (min-width: 1024px) {
  .prop {
    display: block;
  }
}
.prop-scroll {
  bottom: -2.5rem;
  left: 36%;
  width: 190px;
  transform: rotate(-8deg);
}
.prop-sword {
  top: -7rem;
  right: 2.5rem;
  width: 90px;
  transform: rotate(-20deg);
}
.prop-purse {
  right: 41%;
  bottom: -1.5rem;
  width: 120px;
}
.prop-coin {
  right: 38%;
  bottom: -1rem;
  width: 52px;
  transform: rotate(12deg);
}
.prop-books {
  bottom: calc(100% - 1.25rem);
  left: 22%;
  width: 170px;
}


/* A navy section casts a soft shade onto the light section below, so the edge doesn't cut. */
.navy-shade {
  box-shadow: 0 22px 36px -18px color-mix(in srgb, var(--color-navy-950) 55%, transparent);
}

.more-glow {
  background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--color-gold) 12%, transparent), transparent 55%);
}

.marketplace-glow {
  background: radial-gradient(ellipse at 70% 50%, color-mix(in srgb, var(--color-gold) 22%, transparent), transparent 60%);
}
</style>
