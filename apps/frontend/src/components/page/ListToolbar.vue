<script setup lang="ts">
/**
 * Search and filters of a list. Desktop: search, one FilterSelect per filter, "reset filters".
 * Mobile: search, a "Filter" button with the number of active filters (opens the filters as
 * chips) and the sort order.
 * v-model:query, v-model:active (filter key → chosen values), v-model:sort.
 */
import { computed, ref, useId } from "vue";

import BaseButton from "@/components/base/BaseButton.vue";
import Icon from "@/components/base/Icon.vue";
import type { Option } from "@/components/base/types";
import { useAppI18n } from "@/core/i18n";

import FilterSelect from "./FilterSelect.vue";

export type ListFilter = { key: string; label: string; options: Option[] };

const query = defineModel<string>("query", { default: "" });
const active = defineModel<Record<string, string[]>>("active", { default: () => ({}) });
const sort = defineModel<string>("sort", { default: "" });
const props = withDefaults(defineProps<{ placeholder?: string; filters?: ListFilter[]; sortOptions?: Option[] }>(), {
  placeholder: undefined,
  filters: () => [],
  sortOptions: () => [],
});
const { t } = useAppI18n();
const mobileOpen = ref(false);
const panelId = useId();

const activeCount = computed(() => Object.values(active.value).reduce((count, values) => count + values.length, 0));
const hasFilters = computed(() => props.filters.length > 0);

function setFilter(key: string, values: string[]): void {
  active.value = { ...active.value, [key]: values };
}

function toggleChip(key: string, value: string): void {
  const values = active.value[key] ?? [];
  setFilter(key, values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]);
}

function reset(): void {
  active.value = {};
  query.value = "";
}
</script>

<template>
  <div class="mb-4">
    <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <label class="relative md:min-w-72 md:flex-1">
        <span class="sr-only">{{ placeholder ?? t("common.list.search") }}</span>
        <Icon
          name="aktion-suchen"
          :size="22"
          class="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink"
        />
        <input
          v-model="query"
          type="search"
          :placeholder="placeholder ?? t('common.list.search')"
          class="input pl-12!"
        >
      </label>
      <div
        v-if="hasFilters"
        class="hidden flex-wrap items-center gap-3 md:flex"
      >
        <FilterSelect
          v-for="filter in filters"
          :key="filter.key"
          :model-value="active[filter.key] ?? []"
          :label="filter.label"
          :options="filter.options"
          @update:model-value="setFilter(filter.key, $event)"
        />
        <BaseButton
          variant="quiet"
          icon="ui-sort-lines"
          @click="reset"
        >
          {{ t("common.list.resetFilters") }}
        </BaseButton>
      </div>
      <div
        v-if="hasFilters || sortOptions.length > 0"
        class="grid grid-cols-2 gap-3 md:hidden"
      >
        <BaseButton
          v-if="hasFilters"
          bare
          class="border-line-strong!"
          :aria-expanded="mobileOpen"
          :aria-controls="panelId"
          @click="mobileOpen = !mobileOpen"
        >
          <Icon
            name="aktion-filter"
            :size="20"
          />{{ t("common.list.filter") }}
          <span
            v-if="activeCount > 0"
            class="badge badge-burgundy px-2! py-0! text-[0.75rem]"
          >{{ activeCount }}</span>
        </BaseButton>
        <label
          v-if="sortOptions.length > 0"
          class="relative"
          :class="!hasFilters && 'col-span-2'"
        >
          <span class="sr-only">{{ t("common.list.sortBy") }}</span>
          <Icon
            name="ui-sort-lines"
            :size="20"
            class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <select
            v-model="sort"
            class="input pl-10!"
          >
            <option
              v-for="option in sortOptions"
              :key="option.value"
              :value="option.value"
            >{{ option.label }}</option>
          </select>
        </label>
      </div>
    </div>
    <div
      v-if="mobileOpen && hasFilters"
      :id="panelId"
      class="card mt-3 flex flex-col gap-3 p-3 md:hidden"
    >
      <div
        v-for="filter in filters"
        :key="filter.key"
        role="group"
        :aria-label="filter.label"
      >
        <p class="label mb-1">
          {{ filter.label }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in filter.options"
            :key="option.value"
            type="button"
            class="badge min-h-9 border"
            :class="active[filter.key]?.includes(option.value) ? 'badge-burgundy border-primary' : 'badge-outline border-transparent'"
            :aria-pressed="active[filter.key]?.includes(option.value) ?? false"
            @click="toggleChip(filter.key, option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <BaseButton
        variant="quiet"
        @click="reset"
      >
        {{ t("common.list.resetFilters") }}
      </BaseButton>
    </div>
  </div>
</template>
