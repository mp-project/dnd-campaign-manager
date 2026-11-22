<script setup lang="ts">
/** Theme tokens read straight from main.css, so new tokens show up without changes here. */
import themeCss from "@/styles/main.css?raw";

import ShowcaseComponent from "./ShowcaseComponent.vue";
import ShowcaseSection from "./ShowcaseSection.vue";
import ShowcaseVariant from "./ShowcaseVariant.vue";

const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(themeCss)?.[1] ?? "";
const colors = [...theme.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((match) => ({
  name: match[1]!,
  value: match[2]!.trim(),
}));
const groups = [
  { label: "Navy (App-Hülle)", prefix: "navy" },
  { label: "Pergament und Linien", prefix: "parchment|line|backdrop" },
  { label: "Text", prefix: "ink|heading" },
  { label: "Burgunder", prefix: "brand|primary" },
  { label: "Gold und Deko", prefix: "gold|earth|online|alert|mist|sepia|scrollbar" },
  { label: "Status", prefix: "ok|warn|danger|info|violet|neutral" },
  { label: "Tag-Töne", prefix: "tag" },
  { label: "Avatar-Töne", prefix: "avatar" },
].map((group) => ({
  ...group,
  colors: colors.filter((color) => new RegExp(`^(${group.prefix})(-|$)`).test(color.name)),
}));
const shadows = ["shadow-soft", "shadow-drawer", "shadow-popover", "shadow-primary"];
</script>

<template>
  <ShowcaseSection
    id="theme"
    title="Theme"
    description="Tokens aus src/styles/main.css (@theme). Komponenten nutzen nur diese, keine Hex-Werte."
  >
    <ShowcaseComponent
      name="Farben"
      description="Klasse = bg-/text-/border- + Token-Name"
    >
      <ShowcaseVariant
        v-for="group in groups"
        :key="group.label"
        :label="group.label"
        wide
      >
        <div class="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <div
            v-for="color in group.colors"
            :key="color.name"
            class="flex items-center gap-2"
          >
            <span
              class="size-10 shrink-0 rounded-control border border-line"
              :style="{ background: `var(--color-${color.name})` }"
            />
            <span class="min-w-0">
              <code class="block truncate text-[13px]">{{ color.name }}</code>
              <span class="meta">{{ color.value }}</span>
            </span>
          </div>
        </div>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="Typografie"
      description="Literata (Text und Überschriften), Cinzel (Hervorhebungen)"
    >
      <ShowcaseVariant
        label=".page-title"
        wide
      >
        <span class="page-title">Die Schatten von Elaria</span>
      </ShowcaseVariant>
      <ShowcaseVariant label=".section-title / h1–h4">
        <span class="section-title">Grauhafen</span>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="font-display (Hero-Titel)"
        wide
      >
        <span class="font-display text-[34px] leading-tight font-bold text-heading">Die Schatten von Elaria</span>
      </ShowcaseVariant>
      <ShowcaseVariant label=".name-link">
        <span class="name-link">Hauptmann Rovan</span>
      </ShowcaseVariant>
      <ShowcaseVariant label="Fließtext / .label / .meta">
        <span class="flex flex-col">
          <span>Ein verrauchtes Gasthaus am Hafen.</span>
          <span class="label">Name</span>
          <span class="meta">Zuletzt bearbeitet vor 2 Stunden</span>
        </span>
      </ShowcaseVariant>
      <ShowcaseVariant label=".eyebrow / .num">
        <span class="eyebrow text-brand">Welt</span>
        <span class="num">1.234 GM</span>
      </ShowcaseVariant>
    </ShowcaseComponent>

    <ShowcaseComponent
      name="Flächen"
      description="Materialien und Rahmen"
    >
      <ShowcaseVariant label=".parchment .frame-double">
        <div class="parchment frame-double w-full rounded-card p-4">Arbeitsfläche</div>
      </ShowcaseVariant>
      <ShowcaseVariant label=".card / .card-sunk">
        <div class="card p-4">Karte</div>
        <div class="card-sunk p-4">Abgesetzt</div>
      </ShowcaseVariant>
      <ShowcaseVariant
        label="Schatten"
        wide
      >
        <div
          v-for="shadow in shadows"
          :key="shadow"
          class="card p-4"
          :class="shadow"
        >
          <code class="text-[13px]">{{ shadow }}</code>
        </div>
      </ShowcaseVariant>
      <ShowcaseVariant label="Radien">
        <div
          class="size-16 rounded-control border border-gold bg-parchment-sunk"
          title="rounded-control"
        />
        <div
          class="size-16 rounded-card border border-gold bg-parchment-sunk"
          title="rounded-card"
        />
      </ShowcaseVariant>
    </ShowcaseComponent>
  </ShowcaseSection>
</template>
