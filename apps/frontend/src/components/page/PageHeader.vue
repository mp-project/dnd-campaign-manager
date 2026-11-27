<script setup lang="ts">
/**
 * Page head: breadcrumb → domain icon + title → subtitle → page actions.
 * Slots: `actions` (desktop), `mobile-actions` (mobile, e.g. more menu + plus button; without it
 * `actions` show on mobile too), `icon` and `title-extra` next to the title.
 */
import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

import AppBreadcrumb, { type BreadcrumbItem } from "./AppBreadcrumb.vue";

defineProps<{ title: string; subtitle?: string; mobileSubtitle?: string; icon?: IconName; breadcrumb?: BreadcrumbItem[] }>();
defineSlots<{ actions?(): unknown; "mobile-actions"?(): unknown; icon?(): unknown; "title-extra"?(): unknown }>();
</script>

<template>
  <header class="mb-5 md:mb-6">
    <AppBreadcrumb
      v-if="breadcrumb"
      :items="breadcrumb"
    />
    <div class="flex items-start gap-3 md:gap-4">
      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-3 md:gap-4">
          <Icon
            v-if="icon"
            :name="icon"
            :size="44"
            class="shrink-0 text-brand"
          />
          <slot name="icon" />
          <h1 class="page-title min-w-0">
            {{ title }}
          </h1>
          <slot name="title-extra" />
        </div>
        <p
          v-if="subtitle"
          class="mt-1.5 text-[1.0625rem] text-ink-2 md:text-[1.125rem]"
        >
          <span :class="mobileSubtitle && 'hidden md:inline'">{{ subtitle }}</span>
          <span
            v-if="mobileSubtitle"
            class="md:hidden"
          >{{ mobileSubtitle }}</span>
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="flex shrink-0 items-center gap-3"
        :class="$slots['mobile-actions'] && 'hidden md:flex'"
      >
        <slot name="actions" />
      </div>
      <div
        v-if="$slots['mobile-actions']"
        class="flex shrink-0 items-center gap-2 md:hidden"
      >
        <slot name="mobile-actions" />
      </div>
    </div>
  </header>
</template>
