<script setup lang="ts">
/**
 * Number of results, sort order and the list/grid switch (desktop); on mobile only the number.
 * The text comes from the page (plural forms, e.g. `common.results.count`). Default slot: more
 * controls left of the sort order.
 */
import IconButton from "@/components/base/IconButton.vue";
import type { Option } from "@/components/base/types";
import { useAppI18n } from "@/core/i18n";

const sort = defineModel<string>("sort", { default: "" });
const view = defineModel<"list" | "grid">("view", { default: "list" });
withDefaults(defineProps<{ text: string; mobileText?: string; sortOptions?: Option[]; views?: boolean }>(), {
  mobileText: undefined,
  sortOptions: () => [],
  views: false,
});
defineSlots<{ default?(): unknown }>();
const { t } = useAppI18n();
</script>

<template>
  <div class="mb-3 flex items-center gap-3">
    <p
      class="text-[1rem] text-ink-2"
      aria-live="polite"
    >
      <span :class="mobileText && 'hidden md:inline'">{{ text }}</span>
      <span
        v-if="mobileText"
        class="md:hidden"
      >{{ mobileText }}</span>
    </p>
    <div class="ml-auto hidden items-center gap-3 md:flex">
      <slot />
      <label
        v-if="sortOptions.length > 0"
        class="flex items-center gap-3"
      >
        <span class="text-ink-2">{{ t("common.list.sortBy") }}</span>
        <select
          v-model="sort"
          class="input min-h-11! w-48"
        >
          <option
            v-for="option in sortOptions"
            :key="option.value"
            :value="option.value"
          >{{ option.label }}</option>
        </select>
      </label>
      <div
        v-if="views"
        class="flex gap-1"
        role="group"
        :aria-label="t('common.list.view')"
      >
        <IconButton
          :variant="view === 'list' ? 'primary' : 'ghost'"
          icon="ui-list"
          :label="t('common.list.viewList')"
          :aria-pressed="view === 'list'"
          @click="view = 'list'"
        />
        <IconButton
          :variant="view === 'grid' ? 'primary' : 'ghost'"
          icon="ui-grid"
          :label="t('common.list.viewGrid')"
          :aria-pressed="view === 'grid'"
          @click="view = 'grid'"
        />
      </div>
    </div>
  </div>
</template>
