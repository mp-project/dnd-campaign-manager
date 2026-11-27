<script setup lang="ts">
/** Labelled counters: documents · people · links. Counters left out are not shown. */
import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";

defineProps<{ documents?: number; people?: number; links?: number }>();
const { t } = useAppI18n();
const { number } = useFormat();
</script>

<template>
  <span class="num inline-flex items-center gap-4 text-[0.9375rem] text-ink">
    <span
      v-if="documents !== undefined"
      class="inline-flex items-center gap-1.5"
      :title="t('common.counts.documents', documents, { count: documents })"
    >
      <Icon
        name="ui-file"
        :size="19"
      /><span class="sr-only">{{ t("common.counts.documents", documents, { count: documents }) }}</span><span aria-hidden="true">{{ number(documents) }}</span>
    </span>
    <span
      v-if="people !== undefined"
      class="inline-flex items-center gap-1.5"
      :title="t('common.counts.people', people, { count: people })"
    >
      <Icon
        name="ui-users"
        :size="19"
      /><span class="sr-only">{{ t("common.counts.people", people, { count: people }) }}</span><span aria-hidden="true">{{ number(people) }}</span>
    </span>
    <span
      v-if="links !== undefined"
      class="inline-flex items-center gap-1.5"
      :title="t('common.counts.links', links, { count: links })"
    >
      <Icon
        name="ui-link"
        :size="19"
      /><span class="sr-only">{{ t("common.counts.links", links, { count: links }) }}</span><span aria-hidden="true">{{ number(links) }}</span>
    </span>
  </span>
</template>
