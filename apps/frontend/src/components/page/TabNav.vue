<script setup lang="ts">
/**
 * Tabs. With `to` every tab is a link with its own URL (active when the current path is the
 * tab's path or below it; the longest match wins), without `to` they switch `v-model`.
 * On mobile the strip scrolls horizontally in one line.
 */
import { computed } from "vue";
import { type RouteLocationRaw, useRoute, useRouter } from "vue-router";

import Icon from "@/components/base/Icon.vue";
import type { IconName } from "@/components/base/iconNames";

export type TabItem = { id: string; label: string; icon?: IconName; to?: RouteLocationRaw };

const model = defineModel<string>();
const props = withDefaults(defineProps<{ tabs: TabItem[]; label: string; variant?: "boxed" | "plain" }>(), {
  variant: "boxed",
});
const route = useRoute();
const router = useRouter();

const activeId = computed(() => {
  let best: { id: string; length: number } | null = null;
  for (const tab of props.tabs) {
    if (!tab.to) continue;
    const path = router.resolve(tab.to).path.replace(/\/$/, "");
    const hit = route.path === path || route.path === `${path}/` || route.path.startsWith(`${path}/`);
    if (hit && (!best || path.length > best.length)) best = { id: tab.id, length: path.length };
  }
  return best?.id ?? model.value;
});
</script>

<template>
  <div class="mb-5 min-w-0 border-b border-gold/60 md:mb-6">
    <div
      role="tablist"
      :aria-label="label"
      class="no-scrollbar flex gap-2 overflow-x-auto pb-2 [contain:inline-size] md:pb-3"
    >
      <template
        v-for="tab in tabs"
        :key="tab.id"
      >
        <RouterLink
          v-if="tab.to"
          :to="tab.to"
          role="tab"
          :aria-selected="activeId === tab.id"
          :class="['tab', `tab-${variant}`, { 'is-active': activeId === tab.id }]"
        >
          <Icon
            v-if="tab.icon"
            :name="tab.icon"
            :size="20"
          />{{ tab.label }}
        </RouterLink>
        <button
          v-else
          type="button"
          role="tab"
          :aria-selected="activeId === tab.id"
          :class="['tab', `tab-${variant}`, { 'is-active': activeId === tab.id }]"
          @click="model = tab.id"
        >
          <Icon
            v-if="tab.icon"
            :name="tab.icon"
            :size="20"
          />{{ tab.label }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.tab {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 0 20px;
  white-space: nowrap;
  font-size: 1.03125rem;
  color: var(--color-ink);
  border-radius: var(--radius-control);
}
.tab-boxed {
  border: 1px solid var(--color-line);
  background: var(--color-parchment-card);
  min-width: max-content;
}
.tab-boxed:hover {
  background: var(--color-parchment-sunk);
}
.tab-plain {
  padding: 0 14px;
}
.tab.is-active {
  background: var(--color-primary);
  color: var(--color-parchment-card);
  border-color: var(--color-primary);
  box-shadow: var(--shadow-primary);
}
@media (min-width: 768px) {
  .tab-boxed {
    padding: 0 26px;
  }
}
</style>
