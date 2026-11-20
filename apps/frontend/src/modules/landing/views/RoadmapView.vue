<script setup lang="ts">
/**
 * The roadmap, one address per language (`/roadmap`, `/en/roadmap`): a navy head with the status
 * legend, then the phases (`ROADMAP_PHASES`) as a path of stages on parchment, each with its
 * status, what it holds and what it brings, a note leading to the contact form, and the footer of
 * every public page. On phones the compass menu lists the phases. It asks the API nothing.
 */
import { useRoute } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import StatusBadge from "@/components/base/StatusBadge.vue";
import CompassRose from "@/components/layout/CompassRose.vue";
import PublicHeader from "@/components/layout/PublicHeader.vue";
import type { MenuChapter } from "@/components/layout/PublicMenu.vue";
import SiteFooter from "@/components/layout/SiteFooter.vue";
import { useAppI18n } from "@/core/i18n";
import { localizedPath, useHomePath, useLocalizedPage } from "@/core/i18n/localizedRoutes";
import { vReveal } from "@/core/motion/reveal";
import { usePageMeta } from "@/core/seo/pageMeta";
import { absoluteUrl } from "@/core/seo/site";
import { statusDefinition } from "@/core/ui/status";

import { ROADMAP_PHASES, type RoadmapStatus, roadmapPhaseId } from "../roadmap";

const { t } = useAppI18n();
const route = useRoute();
const homePath = useHomePath();
const contact = useLocalizedPage("contact");

usePageMeta({
  title: () => t("landing.roadmap.meta.title"),
  description: () => t("landing.roadmap.meta.description"),
  structuredData: () => {
    const language = route.meta.locale ?? "de";
    return [
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: t("common.publicNav.home"), item: absoluteUrl(localizedPath("", language)) },
          { "@type": "ListItem", position: 2, name: t("landing.roadmap.breadcrumb"), item: absoluteUrl(localizedPath("roadmap", language)) },
        ],
      },
    ];
  },
});

const LEGEND: readonly RoadmapStatus[] = ["COMPLETED", "IN_PROGRESS", "PLANNED"];
const statusLabel = (status: RoadmapStatus) => statusDefinition(status).labelKey!;

const chapters: MenuChapter[] = ROADMAP_PHASES.map((phase) => ({
  section: roadmapPhaseId(phase.id),
  icon: phase.icon,
  label: phase.title,
  hint: statusLabel(phase.status),
}));
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-navy-950 text-parchment">
    <PublicHeader :chapters="chapters" />

    <main class="flex-1">
      <!-- Head: navy like the FAQ's, with the legend of the statuses -->
      <section
        class="roadmap-head navy-shade relative z-10 overflow-x-clip"
        aria-labelledby="roadmap-title"
      >
        <div class="roadmap-glow pointer-events-none absolute inset-0" />
        <CompassRose
          :size="220"
          class="roadmap-compass pointer-events-none absolute hidden lg:block"
          aria-hidden="true"
        />
        <div class="relative mx-auto max-w-400 px-4 pt-8 pb-14 md:px-10 md:pt-12 md:pb-20">
          <nav :aria-label="t('common.shell.breadcrumb')">
            <ol class="flex flex-wrap items-center gap-1 text-[14px] text-parchment/70">
              <li>
                <RouterLink
                  :to="homePath"
                  class="inline-flex min-h-11 items-center hover:underline"
                >
                  {{ t("common.publicNav.home") }}
                </RouterLink>
              </li>
              <li
                class="flex items-center gap-1"
                aria-current="page"
              >
                <Icon
                  name="ui-chevron-right"
                  :size="16"
                  aria-hidden="true"
                />
                {{ t("landing.roadmap.breadcrumb") }}
              </li>
            </ol>
          </nav>
          <div class="mt-4 max-w-170">
            <p class="eyebrow text-gold-light">
              {{ t("landing.roadmap.hero.eyebrow") }}
            </p>
            <h1
              id="roadmap-title"
              class="mt-3 font-heading text-[34px] leading-tight font-bold text-parchment md:text-[48px]"
            >
              {{ t("landing.roadmap.hero.title") }}
            </h1>
            <p class="mt-5 text-[18px] text-parchment/85">
              {{ t("landing.roadmap.hero.lead") }}
            </p>
            <div class="mt-8">
              <p class="text-[15px] text-parchment/85">
                {{ t("landing.roadmap.legend") }}
              </p>
              <ul class="mt-3 flex flex-wrap gap-2">
                <li
                  v-for="status in LEGEND"
                  :key="status"
                >
                  <StatusBadge :status="status" />
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <!-- The phases as a path of stages -->
      <section
        class="parchment on-parchment relative text-ink"
        :aria-label="t('landing.roadmap.hero.title')"
      >
        <div class="relative mx-auto max-w-200 px-4 pt-12 pb-32 md:px-10 md:pt-16 md:pb-44">
          <ol class="roadmap-path relative">
            <li
              v-for="(phase, index) in ROADMAP_PHASES"
              :key="phase.id"
              v-reveal
              class="roadmap-phase relative pl-16 md:pl-20"
              :class="[`is-${phase.status.toLowerCase().replace('_', '-')}`, { 'mt-8': index > 0 }]"
            >
              <span
                class="roadmap-seal absolute top-4 left-0 flex size-12 items-center justify-center rounded-full border border-gold bg-parchment text-brand shadow-soft md:size-14"
                aria-hidden="true"
              >
                <Icon
                  :name="phase.icon"
                  :size="24"
                />
              </span>
              <article
                class="card px-5 py-5 md:px-7 md:py-6"
                :aria-labelledby="roadmapPhaseId(phase.id)"
              >
                <header class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div class="min-w-0">
                    <p class="eyebrow text-gold">
                      {{ t("landing.roadmap.phaseLabel", { number: index + 1 }) }}
                    </p>
                    <h2
                      :id="roadmapPhaseId(phase.id)"
                      class="section-title mt-1"
                    >
                      {{ t(phase.title) }}
                    </h2>
                  </div>
                  <StatusBadge :status="phase.status" />
                </header>
                <p class="mt-3 text-ink-2">
                  {{ t(phase.text) }}
                </p>
                <ul class="mt-4 flex flex-col gap-2">
                  <li
                    v-for="item in phase.items"
                    :key="item"
                    class="flex items-start gap-3"
                  >
                    <span
                      class="roadmap-dot mt-2 size-2 shrink-0 rotate-45 bg-gold"
                      aria-hidden="true"
                    />
                    <span>{{ t(item) }}</span>
                  </li>
                </ul>
              </article>
            </li>
          </ol>

          <aside class="card mt-14 flex flex-col items-start gap-4 px-6 py-6 sm:flex-row sm:items-center md:px-8">
            <span class="flex size-12 shrink-0 items-center justify-center rounded-full border border-gold bg-parchment text-brand">
              <Icon
                name="ui-mail"
                :size="24"
              />
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="section-title">
                {{ t("landing.roadmap.note.title") }}
              </h2>
              <p class="mt-1 text-ink-2">
                {{ t("landing.roadmap.note.text") }}
              </p>
            </div>
            <BaseButton
              :to="contact"
              variant="secondary"
              size="md"
              icon-right="aktion-weiter"
            >
              {{ t("landing.roadmap.note.link") }}
            </BaseButton>
          </aside>
        </div>
      </section>
    </main>

    <SiteFooter heading-id="roadmap-cta" />
  </div>
</template>

<style scoped>
.roadmap-glow {
  background:
    radial-gradient(ellipse at 85% 30%, color-mix(in srgb, var(--color-gold) 18%, transparent), transparent 55%),
    radial-gradient(ellipse at 10% 100%, color-mix(in srgb, var(--color-brand) 16%, transparent), transparent 50%);
}
.roadmap-compass {
  top: 50%;
  right: 8%;
  opacity: 0.22;
  transform: translateY(-50%);
}
.navy-shade {
  box-shadow: 0 22px 36px -18px color-mix(in srgb, var(--color-navy-950) 55%, transparent);
}

/* Below the sticky header, like the FAQ's topics. */
.roadmap-phase {
  scroll-margin-top: 6rem;
}

/* The golden path joining the seals; it ends at the last one. */
.roadmap-path::before {
  content: "";
  position: absolute;
  top: 2.5rem;
  bottom: 2.5rem;
  left: 1.5rem;
  width: 2px;
  transform: translateX(-50%);
  background: linear-gradient(var(--color-gold), var(--color-gold-soft));
}
@media (min-width: 48rem) {
  .roadmap-path::before {
    left: 1.75rem;
  }
}

/* The stage in progress stands out: a burgundy seal; finished ones are filled in gold. */
.is-in-progress .roadmap-seal {
  border-color: var(--color-primary);
  background-color: var(--color-primary);
  color: var(--color-parchment);
}
.is-in-progress .card {
  border-color: var(--color-gold);
}
.is-completed .roadmap-seal {
  background-color: var(--color-gold);
  color: var(--color-parchment);
}
.is-planned .roadmap-dot {
  background-color: var(--color-gold-soft);
}
</style>
