<script setup lang="ts">
/**
 * A legal text in the brand layout: sections with heading and text (line breaks kept), the date
 * of the version and a way back. Reachable without an account.
 */
import { useRouter } from "vue-router";

import BaseButton from "@/components/base/BaseButton.vue";
import InfoNote from "@/components/page/InfoNote.vue";
import { useAppI18n } from "@/core/i18n";
import type { MessageKey } from "@/core/i18n/keys";
import BrandLayout from "@/layouts/BrandLayout.vue";

export type LegalSection = { id: string; title: MessageKey; body: MessageKey };

defineProps<{ title: MessageKey; subtitle: MessageKey; sections: LegalSection[] }>();
const { t } = useAppI18n();
const router = useRouter();

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
    <InfoNote tone="warn">
      {{ t("legal.example") }}
    </InfoNote>
    <div class="mt-6 flex flex-col gap-6">
      <section
        v-for="section in sections"
        :key="section.id"
        :aria-labelledby="`legal-${section.id}`"
      >
        <h2
          :id="`legal-${section.id}`"
          class="section-title"
        >
          {{ t(section.title) }}
        </h2>
        <p class="mt-2 whitespace-pre-line text-ink-2">
          {{ t(section.body) }}
        </p>
      </section>
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
