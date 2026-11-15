<script setup lang="ts">
/**
 * Pages of a list that is paged on the server: range ("1–6 von 1.284") or entries per page on the
 * left, a shortened page list (1 2 … 214) with previous/next on the right; on mobile "Seite 5 von
 * 12" between previous and next. `loadMore` replaces it on mobile with a "Mehr laden" button
 * (emits `more`).
 */
import { computed } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";
import { useFormat } from "@/core/i18n/format";

const page = defineModel<number>({ default: 1 });
const perPage = defineModel<number>("perPage", { default: 25 });
const props = withDefaults(
  defineProps<{ pages: number; total?: number; perPageOptions?: number[]; loadMore?: boolean; moreLabel?: string }>(),
  { total: undefined, perPageOptions: () => [], moreLabel: undefined },
);
const emit = defineEmits<{ more: [] }>();
const { t } = useAppI18n();
const { number } = useFormat();

/** Pages around the current one plus first and last; gaps become "…". */
type PageEntry = number | "gap";
const entries = computed<PageEntry[]>(() => {
  const count = Math.max(1, props.pages);
  if (count <= 5) return Array.from({ length: count }, (_, index) => index + 1);
  const center = Math.min(Math.max(page.value, 2), count - 1);
  const shown = [...new Set([1, center - 1, center, center + 1, count])].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  return shown.flatMap((n, index) => (index > 0 && n - shown[index - 1]! > 1 ? (["gap", n] as PageEntry[]) : [n]));
});

const range = computed(() => {
  if (props.total === undefined) return "";
  if (props.total === 0) return t("common.pagination.range", { from: number(0), to: number(0), total: number(0) });
  const from = (page.value - 1) * perPage.value + 1;
  const to = Math.min(page.value * perPage.value, props.total);
  return t("common.pagination.range", { from: number(from), to: number(to), total: number(props.total) });
});

function go(target: number): void {
  page.value = Math.min(Math.max(target, 1), Math.max(1, props.pages));
}
</script>

<template>
  <nav
    class="mt-5 flex-wrap items-center gap-3"
    :class="loadMore ? 'hidden md:flex' : 'flex'"
    :aria-label="t('common.pagination.label')"
  >
    <span
      v-if="range"
      class="num text-[15.5px] text-ink"
    >{{ range }}</span>
    <label
      v-if="perPageOptions.length > 0"
      class="hidden items-center gap-2 md:flex"
    >
      <select
        v-model.number="perPage"
        class="input min-h-11! w-20!"
      >
        <option
          v-for="option in perPageOptions"
          :key="option"
          :value="option"
        >{{ option }}</option>
      </select>
      <span class="text-ink-2">{{ t("common.pagination.perPage") }}</span>
    </label>
    <div class="ml-auto flex items-center gap-1.5 md:gap-2">
      <BaseButton
        bare
        icon-only
        class="border-line!"
        :disabled="page <= 1"
        :label="t('common.pagination.previous')"
        @click="go(page - 1)"
      >
        <Icon
          name="ui-chevron-left"
          :size="18"
        />
      </BaseButton>
      <template
        v-for="(entry, index) in entries"
        :key="index"
      >
        <span
          v-if="entry === 'gap'"
          class="hidden px-1 text-ink-2 md:inline"
          aria-hidden="true"
        >…</span>
        <BaseButton
          v-else
          bare
          icon-only
          :variant="entry === page ? 'primary' : 'secondary'"
          class="num hidden! md:inline-flex!"
          :class="entry !== page && 'border-line!'"
          :label="t('common.pagination.page', { page: number(entry), total: number(pages) })"
          :aria-current="entry === page ? 'page' : undefined"
          @click="go(entry)"
        >
          {{ number(entry) }}
        </BaseButton>
      </template>
      <span class="num px-2 text-ink md:hidden">{{ t("common.pagination.page", { page: number(page), total: number(pages) }) }}</span>
      <BaseButton
        bare
        icon-only
        class="border-line!"
        :disabled="page >= pages"
        :label="t('common.pagination.next')"
        @click="go(page + 1)"
      >
        <Icon
          name="ui-chevron-right"
          :size="18"
        />
      </BaseButton>
    </div>
  </nav>
  <div
    v-if="loadMore && page < pages"
    class="mt-4 md:hidden"
  >
    <BaseButton
      block
      @click="emit('more')"
    >
      {{ moreLabel ?? t("common.pagination.loadMore") }}
    </BaseButton>
  </div>
</template>
