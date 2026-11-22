<script setup lang="ts">
/**
 * A legal text in the brand layout: sections with heading and text (line breaks kept, web
 * addresses as links, more content per section through the slot `after-<id>`), optionally grouped
 * in numbered chapters (a section with `chapter` starts one; its sections' headings move a level
 * down), the date of the version and a way back, with its own title and description for search
 * engines. Reachable without an account.
 */
import { computed } from "vue";
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import { usePageMeta } from "@/core/seo/pageMeta";
import BrandLayout from "@/layouts/BrandLayout.vue";

/** A section; without `title` only its text (e.g. the source line at the end). */
export type LegalSection = { id: string; title?: MessageKey; body: MessageKey; chapter?: MessageKey };

const props = defineProps<{ title: MessageKey; subtitle: MessageKey; description: MessageKey; sections: LegalSection[] }>();
const { t } = useAppI18n();
usePageMeta({ title: () => t(props.title), description: () => t(props.description) });
const router = useRouter();
/** With chapters, the chapters are the second level and the sections the third. */
const sectionHeading = computed(() => (props.sections.some((section) => section.chapter) ? "h3" : "h2"));

/** An address in a legal text: `https://` up to the next space, without a closing punctuation mark. */
const URL_PATTERN = /(https:\/\/\S*[^\s.,;:)])/;

/** The text of a section in pieces, every web address as its own piece with `href`. */
function textParts(key: MessageKey): { text: string; href?: string }[] {
  return t(key)
    .split(URL_PATTERN)
    .filter((part) => part !== "")
    .map((part) => (URL_PATTERN.test(part) ? { text: part, href: part } : { text: part }));
}

/** Back where the visitor came from in this app; opened directly (new tab, link), to the start page. */
function back(): void {
  if (router.options.history.state.back) router.back();
  else void router.push("/");
}
</script>

<template>
  <BrandLayout
    :title="t(title)"
    :subtitle="t(subtitle)"
    size="wide"
  >
    <div class="flex flex-col gap-6">
      <template
        v-for="section in sections"
        :key="section.id"
      >
        <h2
          v-if="section.chapter"
          class="legal-chapter section-title"
        >
          {{ t(section.chapter) }}
        </h2>
        <section :aria-labelledby="section.title ? `legal-${section.id}` : undefined">
          <component
            :is="sectionHeading"
            v-if="section.title"
            :id="`legal-${section.id}`"
            :class="sectionHeading === 'h2' ? 'section-title' : 'legal-subtitle'"
          >
            {{ t(section.title) }}
          </component>
          <p class="mt-2 whitespace-pre-line text-ink-2">
            <template
              v-for="(part, index) in textParts(section.body)"
              :key="index"
            >
              <a
                v-if="part.href"
                :href="part.href"
                target="_blank"
                rel="noopener noreferrer"
                class="break-all text-info underline underline-offset-4"
              >{{ part.text }}</a>
              <template v-else>
                {{ part.text }}
              </template>
            </template>
          </p>
          <slot :name="`after-${section.id}`" />
        </section>
      </template>
    </div>
    <p class="meta mt-6">
      {{ t("legal.updated") }}
    </p>

    <template #footer>
      <BaseButton
        icon="ui-chevron-left"
        size="md"
        @click="back"
      >
        {{ t("legal.back") }}
      </BaseButton>
    </template>
  </BrandLayout>
</template>

<style scoped>
.legal-chapter {
  font-size: 24px;
  margin-top: 1rem;
}

.legal-subtitle {
  font-family: var(--font-heading);
  font-weight: 700;
  color: var(--color-heading);
  font-size: 18px;
  overflow-wrap: break-word;
}
</style>
