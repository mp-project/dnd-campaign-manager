<script setup lang="ts">
/**
 * Frequently asked questions, one address per language (`/faq`, `/en/faq`): a navy head with the
 * search, then the questions by topic on parchment, a sticky list of topics beside them from lg
 * on, and the footer of every public page. Every answer is in the page from the start (only
 * hidden while closed), so the prerendered HTML and the `FAQPage` JSON-LD carry them all.
 * `#faq-<id>` in the address opens that question. Like the start page it asks the API nothing.
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import TextInput from "@/components/base/TextInput.vue";
import CompassRose from "@/components/layout/CompassRose.vue";
import SiteFooter from "@/components/layout/SiteFooter.vue";
import { demoUrl } from "@/core/demo";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { localizedPath, useHomePath, useLocalizedPage } from "@/core/i18n/localizedRoutes";
import { vReveal } from "@/core/motion/reveal";
import { absoluteUrl } from "@/core/seo/site";
import { usePageMeta } from "@/core/seo/pageMeta";

import castleRuinScene from "../assets/deco/castle-ruin.webp";
import scrollArt from "../assets/deco/scroll.webp";
import type { MenuChapter } from "../components/LandingMenu.vue";
import PublicHeader from "../components/PublicHeader.vue";
import {
  FAQ_GROUPS,
  type FaqLink,
  faqQuestionId,
  faqStructuredData,
  faqTopicId,
  matchingQuestions,
} from "../faq";

const { t } = useAppI18n();
const route = useRoute();
const demo = demoUrl();
const homePath = useHomePath();
const home = useLocalizedPage("landing");
const contact = useLocalizedPage("contact");
const text = (key: MessageKey) => t(key);

usePageMeta({
  title: () => t("landing.faq.meta.title"),
  description: () => t("landing.faq.meta.description"),
  structuredData: () => {
    const language = route.meta.locale ?? "de";
    return faqStructuredData({
      groups: FAQ_GROUPS,
      text,
      locale: String(language),
      home: { name: t("landing.header.home"), url: absoluteUrl(localizedPath("", language)) },
      page: { name: t("landing.faq.breadcrumb"), url: absoluteUrl(localizedPath("faq", language)) },
    });
  },
});

const chapters = computed<MenuChapter[]>(() =>
  FAQ_GROUPS.map((group) => ({ section: faqTopicId(group.id), icon: group.icon, label: group.title, hint: group.hint })),
);
const total = FAQ_GROUPS.reduce((sum, group) => sum + group.questions.length, 0);

// Search: every word must appear in the question or its answer, in the active language.
const query = ref("");
const matches = computed(() => matchingQuestions(FAQ_GROUPS, query.value, text));
const searching = computed(() => query.value.trim() !== "");
const visibleGroups = computed(() => FAQ_GROUPS.filter((group) => group.questions.some((item) => matches.value.has(item.id))));

// Open questions: the one named in the address at first; while searching, every match.
const opened = ref(new Set<string>());
const fromAddress = FAQ_GROUPS.flatMap((group) => group.questions).find((item) => route.hash === `#${faqQuestionId(item.id)}`);
if (fromAddress) opened.value = new Set([fromAddress.id]);
watch(query, () => {
  opened.value = searching.value ? new Set(matches.value) : new Set();
});

function toggle(id: string): void {
  const next = new Set(opened.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  opened.value = next;
}
const allOpen = computed(() => [...matches.value].every((id) => opened.value.has(id)));
function toggleAll(): void {
  opened.value = allOpen.value ? new Set() : new Set(matches.value);
}

const privacy = { name: "legal-privacy" } as const;
const register = { name: "auth-register" } as const;
const LINK_LABEL: Record<FaqLink, MessageKey> = {
  demo: "landing.faq.links.demo",
  register: "landing.faq.links.register",
  privacy: "landing.faq.links.privacy",
};
/** The links below an answer; the demo only when there is one. */
function linksOf(links: readonly FaqLink[] | undefined): FaqLink[] {
  return (links ?? []).filter((link) => link !== "demo" || demo);
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-navy-950 text-parchment">
    <PublicHeader
      :chapters="chapters"
      :page-link="{ to: home, label: 'landing.header.home', icon: 'ui-house' }"
    />

    <main class="flex-1">
      <!-- Head: navy like the start page's hero, with the search -->
      <section
        class="faq-head navy-shade relative z-10 overflow-x-clip"
        aria-labelledby="faq-title"
      >
        <div class="faq-glow pointer-events-none absolute inset-0" />
        <CompassRose
          :size="220"
          class="faq-compass pointer-events-none absolute hidden lg:block"
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
                  {{ t("landing.header.home") }}
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
                {{ t("landing.faq.breadcrumb") }}
              </li>
            </ol>
          </nav>
          <div class="mt-4 max-w-170">
            <p class="eyebrow text-gold-light">
              {{ t("landing.faq.hero.eyebrow") }}
            </p>
            <h1
              id="faq-title"
              class="mt-3 font-heading text-[34px] leading-tight font-bold text-parchment md:text-[48px]"
            >
              {{ t("landing.faq.hero.title") }}
            </h1>
            <p class="mt-5 text-[18px] text-parchment/85">
              {{ t("landing.faq.hero.lead") }}
            </p>
            <div
              role="search"
              class="mt-8 max-w-140"
            >
              <label
                for="faq-search"
                class="mb-2 block text-[15px] text-parchment/85"
              >
                {{ t("landing.faq.search.label") }}
              </label>
              <TextInput
                id="faq-search"
                v-model="query"
                type="search"
                icon="aktion-suchen"
                :placeholder="t('landing.faq.search.placeholder')"
                autocomplete="off"
                class="text-ink"
              />
            </div>
          </div>
          <!-- Topics between md and lg; on phones the compass menu lists them, from lg on the column beside the questions -->
          <ul class="mt-8 hidden flex-wrap gap-2 md:flex lg:hidden">
            <li
              v-for="group in FAQ_GROUPS"
              :key="group.id"
            >
              <a
                :href="`#${faqTopicId(group.id)}`"
                class="topic-chip inline-flex min-h-11 items-center gap-2 rounded-full border border-gold/50 px-4 text-[15px] text-parchment"
              >
                <Icon
                  :name="group.icon"
                  :size="16"
                  class="text-gold-light"
                />
                {{ t(group.title) }}
              </a>
            </li>
          </ul>
        </div>
      </section>

      <!-- The questions by topic -->
      <section
        class="parchment on-parchment relative text-ink"
        :aria-label="t('landing.faq.hero.title')"
      >
        <img
          :src="castleRuinScene"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          class="faq-scene pointer-events-none absolute"
        >
        <div class="relative mx-auto grid max-w-400 gap-10 px-4 pt-12 pb-32 md:px-10 md:pt-16 md:pb-44 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[19rem_minmax(0,52rem)] xl:justify-center">
          <aside class="hidden lg:block">
            <nav
              class="faq-topics sticky"
              :aria-label="t('landing.faq.topics')"
            >
              <p class="eyebrow text-brand">
                {{ t("landing.faq.topics") }}
              </p>
              <ol class="mt-4 flex flex-col gap-1">
                <li
                  v-for="group in FAQ_GROUPS"
                  :key="group.id"
                >
                  <a
                    :href="`#${faqTopicId(group.id)}`"
                    class="topic-link flex items-center gap-3 rounded-card px-3 py-2.5"
                  >
                    <span class="topic-seal flex size-9 shrink-0 items-center justify-center rounded-full border border-gold bg-parchment text-brand">
                      <Icon
                        :name="group.icon"
                        :size="20"
                      />
                    </span>
                    <span class="min-w-0">
                      <span class="block font-heading text-[16px] leading-snug text-heading">{{ t(group.title) }}</span>
                      <span class="block text-[13px] text-ink-3">{{ t("landing.faq.questionCount", { count: group.questions.length }) }}</span>
                    </span>
                  </a>
                </li>
              </ol>
              <img
                :src="scrollArt"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                class="faq-prop mt-10"
              >
            </nav>
          </aside>

          <div class="min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-gold/40 pb-3">
              <p
                class="text-[15px] text-ink-2"
                aria-live="polite"
              >
                <template v-if="searching">
                  {{ t("landing.faq.search.results", matches.size, { count: matches.size }) }}
                </template>
                <template v-else>
                  {{ t("landing.faq.questionCount", { count: total }) }}
                </template>
              </p>
              <BaseButton
                v-if="matches.size > 0"
                variant="ghost"
                size="sm"
                :icon="allOpen ? 'aktion-einklappen' : 'aktion-ausklappen'"
                @click="toggleAll"
              >
                {{ t(allOpen ? "landing.faq.collapseAll" : "landing.faq.expandAll") }}
              </BaseButton>
            </div>

            <div
              v-if="matches.size === 0"
              class="card mt-8 flex flex-col items-center px-6 py-10 text-center"
            >
              <Icon
                name="orig-quest-kompass"
                :size="40"
                class="text-gold"
              />
              <p class="mt-4 max-w-120 text-ink-2">
                {{ t("landing.faq.search.empty", { query: query.trim() }) }}
              </p>
              <BaseButton
                variant="secondary"
                size="md"
                class="mt-6"
                @click="query = ''"
              >
                {{ t("landing.faq.search.reset") }}
              </BaseButton>
            </div>

            <section
              v-for="group in FAQ_GROUPS"
              v-show="visibleGroups.includes(group)"
              :key="group.id"
              v-reveal
              class="faq-group mt-10 first-of-type:mt-8"
              :aria-labelledby="faqTopicId(group.id)"
            >
              <header class="flex items-center gap-4">
                <span class="flex size-12 shrink-0 items-center justify-center rounded-full border border-gold bg-parchment text-brand shadow-soft">
                  <Icon
                    :name="group.icon"
                    :size="24"
                  />
                </span>
                <div class="min-w-0">
                  <h2
                    :id="faqTopicId(group.id)"
                    class="section-title"
                  >
                    {{ t(group.title) }}
                  </h2>
                  <p class="text-[15px] text-ink-3">
                    {{ t(group.hint) }}
                  </p>
                </div>
              </header>
              <ul class="mt-5 flex flex-col gap-3">
                <li
                  v-for="item in group.questions"
                  v-show="matches.has(item.id)"
                  :id="faqQuestionId(item.id)"
                  :key="item.id"
                  class="faq-item card"
                  :class="{ 'is-open': opened.has(item.id) }"
                >
                  <h3>
                    <button
                      :id="`${faqQuestionId(item.id)}-question`"
                      type="button"
                      class="faq-question flex w-full items-center gap-4 px-5 py-4 text-left md:px-6"
                      :aria-expanded="opened.has(item.id)"
                      :aria-controls="`${faqQuestionId(item.id)}-answer`"
                      @click="toggle(item.id)"
                    >
                      <span class="min-w-0 flex-1 font-heading text-[17px] leading-snug text-heading md:text-[18px]">
                        {{ t(item.question) }}
                      </span>
                      <span class="faq-chevron flex size-8 shrink-0 items-center justify-center rounded-full border border-gold/60 text-brand">
                        <Icon
                          name="ui-chevron-down"
                          :size="20"
                        />
                      </span>
                    </button>
                  </h3>
                  <Transition name="fade">
                    <div
                      v-show="opened.has(item.id)"
                      :id="`${faqQuestionId(item.id)}-answer`"
                      role="region"
                      :aria-labelledby="`${faqQuestionId(item.id)}-question`"
                      class="px-5 pb-5 md:px-6"
                    >
                      <div class="faq-answer border-t border-gold/30 pt-4">
                        <p class="text-ink-2">
                          {{ t(item.answer) }}
                        </p>
                        <div
                          v-if="linksOf(item.links).length"
                          class="mt-4 flex flex-wrap gap-2"
                        >
                          <template
                            v-for="link in linksOf(item.links)"
                            :key="link"
                          >
                            <BaseButton
                              v-if="link === 'demo'"
                              as="a"
                              :href="demo!"
                              target="_blank"
                              rel="noopener"
                              variant="secondary"
                              size="sm"
                              icon="aktion-ansehen"
                            >
                              {{ t(LINK_LABEL[link]) }}
                            </BaseButton>
                            <BaseButton
                              v-else
                              :to="link === 'privacy' ? privacy : register"
                              variant="secondary"
                              size="sm"
                              icon-right="aktion-weiter"
                            >
                              {{ t(LINK_LABEL[link]) }}
                            </BaseButton>
                          </template>
                        </div>
                      </div>
                    </div>
                  </Transition>
                </li>
              </ul>
            </section>

            <aside class="faq-contact card mt-14 flex flex-col items-start gap-4 px-6 py-6 sm:flex-row sm:items-center md:px-8">
              <span class="flex size-12 shrink-0 items-center justify-center rounded-full border border-gold bg-parchment text-brand">
                <Icon
                  name="ui-mail"
                  :size="24"
                />
              </span>
              <div class="min-w-0 flex-1">
                <h2 class="section-title">
                  {{ t("landing.faq.contact.title") }}
                </h2>
                <p class="mt-1 text-ink-2">
                  {{ t("landing.faq.contact.text") }}
                </p>
              </div>
              <BaseButton
                :to="contact"
                variant="secondary"
                size="md"
                icon-right="aktion-weiter"
              >
                {{ t("landing.faq.contact.link") }}
              </BaseButton>
            </aside>
          </div>
        </div>
      </section>
    </main>

    <SiteFooter heading-id="faq-cta" />
  </div>
</template>

<style scoped>
.faq-glow {
  background:
    radial-gradient(ellipse at 85% 30%, color-mix(in srgb, var(--color-gold) 18%, transparent), transparent 55%),
    radial-gradient(ellipse at 10% 100%, color-mix(in srgb, var(--color-brand) 16%, transparent), transparent 50%);
}
.faq-compass {
  top: 50%;
  right: 8%;
  opacity: 0.22;
  transform: translateY(-50%);
}

/* A navy section casts a soft shade onto the parchment below, like on the start page. */
.navy-shade {
  box-shadow: 0 22px 36px -18px color-mix(in srgb, var(--color-navy-950) 55%, transparent);
}

.topic-chip {
  background-color: color-mix(in srgb, var(--color-parchment) 6%, transparent);
  transition: background-color var(--motion-duration-fast) var(--motion-ease-standard);
}
.topic-chip:hover,
.topic-chip:focus-visible {
  background-color: color-mix(in srgb, var(--color-gold) 18%, transparent);
}

/* Below the sticky header, which is about 5 rem tall at the top and slimmer when scrolled. */
.faq-topics {
  top: 6rem;
}
.faq-group,
.faq-item {
  scroll-margin-top: 6rem;
}

.topic-link {
  transition: background-color var(--motion-duration-fast) var(--motion-ease-standard);
}
.topic-link:hover,
.topic-link:focus-visible {
  background-color: color-mix(in srgb, var(--color-gold) 14%, transparent);
}

.faq-item {
  overflow: hidden;
  transition:
    border-color var(--motion-duration-base) var(--motion-ease-standard),
    box-shadow var(--motion-duration-base) var(--motion-ease-standard);
}
.faq-item.is-open {
  border-color: var(--color-gold);
  box-shadow: 0 16px 32px -22px color-mix(in srgb, var(--color-ink) 50%, transparent);
}
.faq-question:focus-visible {
  outline: 2px solid var(--color-gold);
  outline-offset: -4px;
}
.faq-question:hover .faq-chevron {
  background-color: color-mix(in srgb, var(--color-gold) 16%, transparent);
}
.faq-chevron {
  transition:
    transform var(--motion-duration-base) var(--motion-ease-standard),
    background-color var(--motion-duration-fast) var(--motion-ease-standard);
}
.is-open .faq-chevron {
  transform: rotate(180deg);
}

.faq-scene {
  right: 0;
  bottom: 6rem;
  width: min(42%, 560px);
  opacity: 0.22;
  mask-image: linear-gradient(to left, black 50%, transparent);
}

.faq-prop {
  width: 170px;
  transform: rotate(-8deg);
  filter: drop-shadow(0 10px 14px color-mix(in srgb, var(--color-navy-950) 30%, transparent));
}
</style>
