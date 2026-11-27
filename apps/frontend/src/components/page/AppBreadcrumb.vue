<script setup lang="ts">
/**
 * Breadcrumb above the page title; the last item is the current page. `mobileLabel` shortens an
 * item on small screens ("Orte" instead of "Welt – Orte").
 */
import type { RouteLocationRaw } from "vue-router";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";

export type BreadcrumbItem = { label: string; to?: RouteLocationRaw; mobileLabel?: string };

defineProps<{ items: BreadcrumbItem[] }>();
const { t } = useAppI18n();
</script>

<template>
  <nav
    :aria-label="t('common.shell.breadcrumb')"
    class="mb-2 text-[0.9375rem]"
  >
    <ol class="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-2">
      <li
        v-for="(item, index) in items"
        :key="index"
        class="flex items-center gap-2"
      >
        <Icon
          v-if="index > 0"
          name="ui-chevron-right"
          :size="16"
          class="text-ink-3"
        />
        <RouterLink
          v-if="item.to && index < items.length - 1"
          :to="item.to"
          class="hover:text-brand hover:underline"
        >
          <span
            v-if="item.mobileLabel"
            class="md:hidden"
          >{{ item.mobileLabel }}</span>
          <span :class="item.mobileLabel && 'hidden md:inline'">{{ item.label }}</span>
        </RouterLink>
        <span
          v-else
          :aria-current="index === items.length - 1 ? 'page' : undefined"
          :class="index === items.length - 1 && 'font-semibold text-heading'"
        >{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
