<script setup lang="ts">
/**
 * Development only (`/_bausteine`): every building block in all its variants, with example content
 * from the clickdummy, to compare against it. Not in the production build; texts are not translated.
 * `tests/unit/components/showcase.test.ts` fails when a shared component (base, content, page,
 * layout) is missing here; only the shell parts that need a session are shown in the app itself.
 */
import BadgesSection from "./showcase/BadgesSection.vue";
import ButtonsSection from "./showcase/ButtonsSection.vue";
import ContentSection from "./showcase/ContentSection.vue";
import ControlsSection from "./showcase/ControlsSection.vue";
import FieldsSection from "./showcase/FieldsSection.vue";
import IconsSection from "./showcase/IconsSection.vue";
import LayoutSection from "./showcase/LayoutSection.vue";
import MenusSection from "./showcase/MenusSection.vue";
import ThemeSection from "./showcase/ThemeSection.vue";

const sections = [
  { id: "theme", label: "Theme" },
  { id: "buttons", label: "Buttons" },
  { id: "badges", label: "Badges, Status, Avatare" },
  { id: "icons", label: "Icons" },
  { id: "fields", label: "Formularfelder" },
  { id: "controls", label: "Auswahl und Zähler" },
  { id: "menus", label: "Menüs und Einzelwerte" },
  { id: "content", label: "Inhalte" },
  { id: "layout", label: "Layout und Navigation" },
];
</script>

<template>
  <main class="min-h-screen bg-backdrop p-3 md:p-8">
    <div class="parchment on-parchment frame-double mx-auto flex max-w-6xl flex-col gap-8 rounded-card p-4 md:p-8">
      <header class="flex flex-col gap-3">
        <p class="eyebrow text-brand">
          Entwicklung
        </p>
        <h1 class="page-title">
          Bausteine
        </h1>
        <p class="text-ink-2">
          Alle gemeinsamen Bausteine mit ihren Varianten im Chronik-Theme, zum Abgleich mit dem Klickdummy.
          Sprache umschalten: <a
            class="text-brand underline"
            href="?lang=en"
          >?lang=en</a>, Pseudo-Sprache:
          <a
            class="text-brand underline"
            href="?lang=qps"
          >?lang=qps</a>.
        </p>
        <nav
          class="flex flex-wrap gap-2"
          aria-label="Inhalt"
        >
          <a
            v-for="section in sections"
            :key="section.id"
            :href="`#${section.id}`"
            class="badge badge-outline hover:bg-parchment-sunk"
          >
            {{ section.label }}
          </a>
        </nav>
      </header>
      <ThemeSection />
      <ButtonsSection />
      <BadgesSection />
      <IconsSection />
      <FieldsSection />
      <ControlsSection />
      <MenusSection />
      <ContentSection />
      <LayoutSection />
    </div>
  </main>
</template>
